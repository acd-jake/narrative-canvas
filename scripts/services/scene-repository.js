import { NarrativeSettings } from "./settings.js";
import { NarrativeLogger } from "./logger.js";

/**
 * Persistence gateway for narrative scenes.
 * Every mutation reads the stored scenes, applies one change and saves the result.
 */
export class NarrativeSceneRepository {
  static #mutationQueue = Promise.resolve();

  /** @returns {object[]} All stored scenes with healed tracks and assets. */
  static getAll() {
    const raw = foundry.utils.deepClone(NarrativeSettings.getAllScenes() ?? []);
    return raw.map(scene => this.#healScene(scene));
  }

  static #healScene(scene) {
    if (!scene) return scene;
    scene.backgrounds ??= [];
    scene.handoutImages ??= [];
    const migratedHandouts = scene.backgrounds.filter(background => background.displayMode === "journal");
    scene.backgrounds = scene.backgrounds.filter(background => background.displayMode !== "journal");
    for (const handoutImage of migratedHandouts) {
      if (!scene.handoutImages.some(existing => existing.path === handoutImage.path)) {
        scene.handoutImages.push(handoutImage);
      }
    }
    for (const image of [...scene.backgrounds, ...scene.handoutImages]) {
      image.description ??= "";
      image.showDescription ??= false;
      delete image.displayMode;
    }
    for (const background of scene.backgrounds) {
      background.viewAutomatically ??= false;
    }
    if (Array.isArray(scene.tracks)) {
      scene.tracks.forEach(track => this.#healTrack(track));
    }
    if (Array.isArray(scene.actors)) {
      scene.actors.forEach(actor => this.#healActor(actor));
    }
    return scene;
  }

  static #healActor(actor) {
    if (!actor) return actor;
    if (actor.showName === undefined) {
      actor.showName = true;
    }
    return actor;
  }

  static #healTrack(track) {
    if (!track) return track;
    track.playAutomatically ??= false;

    const playlistSound = this.#findPlaylistSound(track);
    if (playlistSound) {
      const { playlist, sound } = playlistSound;
      const hadPlaylistReference = Boolean(track.sourcePlaylistId);
      track.id = sound.id;
      track.name = sound.name;
      track.path = sound.path;
      track.uuid = sound.uuid;
      track.sourcePlaylistId = playlist.id;
      track.sourcePlaylistName = playlist.name;

      if (!hadPlaylistReference) {
        NarrativeLogger.info("Linked scene audio to its Foundry PlaylistSound", {
          trackId: track.id,
          trackName: track.name,
          playlistId: playlist.id,
          playlistName: playlist.name
        });
      }
    }

    // Keep unresolved legacy entries visible so the GM can identify and replace them.
    if (!track.name && track.path) {
      const filename = track.path.split("/").pop() || "";
      const baseName = filename.replace(/\.[^/.]+$/, "");
      track.name = decodeURIComponent(baseName) || "Track";
    }

    // 4. Default fallback name
    if (!track.name) {
      track.name = game.i18n?.localize("NARRATIVE_CANVAS.Director.Audio") || "Track";
    }

    return track;
  }

  static #findPlaylistSound(track) {
    const playlists = game.playlists ?? game.collections?.get("Playlist");
    if (!playlists) return null;

    if (track.uuid) {
      try {
        const sound = foundry.utils.fromUuidSync(track.uuid);
        const playlist = sound?.parent?.documentName === "Playlist" ? sound.parent : null;
        if (playlist && sound.documentName === "PlaylistSound") return { playlist, sound };
      } catch {}
    }

    const preferredPlaylist = track.sourcePlaylistId ? playlists.get(track.sourcePlaylistId) : null;
    const orderedPlaylists = [
      ...(preferredPlaylist ? [preferredPlaylist] : []),
      ...Array.from(playlists).filter(playlist => playlist !== preferredPlaylist)
    ];

    for (const playlist of orderedPlaylists) {
      const soundById = track.id ? playlist.sounds?.get(track.id) : null;
      const soundByPath = !soundById && track.path
        ? Array.from(playlist.sounds ?? []).find(sound => sound.path === track.path)
        : null;
      const sound = soundById ?? soundByPath;
      if (sound) return { playlist, sound };
    }
    return null;
  }

  /**
   * @param {string|null} journalId - Restricts the result to this journal's scenes when set.
   * @returns {object[]}
   */
  static getVisible(journalId = null) {
    const scenes = this.getAll();
    return journalId ? scenes.filter(scene => scene.journalId === journalId) : scenes;
  }

  /**
   * @param {{name: string, journalId?: string|null}} options
   * @returns {Promise<object>} The created scene.
   */
  static async create({ name, journalId = null }) {
    return this.#queueMutation(async () => {
      const scenes = this.getAll();
      const scene = {
        id: `scene-${foundry.utils.randomID()}`,
        name: this.#toUniqueName(name, scenes),
        backgrounds: [],
        handoutImages: [],
        actors: [],
        tracks: []
      };
      if (journalId) {
        scene.journalId = journalId;
        scene.journalName = game.collections.get("JournalEntry").get(journalId)?.name;
      }

      await NarrativeSettings.saveAllScenes([...scenes, scene]);
      return scene;
    });
  }

  static async remove(sceneId) {
    return this.#queueMutation(() => NarrativeSettings.saveAllScenes(this.getAll().filter(scene => scene.id !== sceneId)));
  }

  static async reorderScenes(sourceSceneId, targetSceneId, position) {
    if (!sourceSceneId || !targetSceneId || sourceSceneId === targetSceneId) return;

    return this.#queueMutation(async () => {
      const scenes = this.getAll();
      if (!this.#moveItems(scenes, sourceSceneId, targetSceneId, position, scene => scene.id)) return;
      await NarrativeSettings.saveAllScenes(scenes);
    });
  }

  static async reorderSceneItems(sceneId, collectionName, sourceId, targetId, position) {
    if (!sceneId || sourceId === null || targetId === null || sourceId === targetId) return;

    if (!["backgrounds", "handoutImages", "actors", "audioEntries"].includes(collectionName)) return;

    await this.#update(sceneId, scene => {
      if (collectionName === "audioEntries") {
        const entries = this.#audioEntryGroups(scene.tracks);
        if (!this.#moveItems(entries, sourceId, targetId, position, entry => entry.id)) return;
        scene.tracks = entries.flatMap(entry => entry.tracks);
        return;
      }

      const items = scene[collectionName];
      if (collectionName === "backgrounds" || collectionName === "handoutImages") {
        this.#moveItems(items, Number(sourceId), Number(targetId), position, (item, index) => index);
        return;
      }

      this.#moveItems(items, sourceId, targetId, position, actor => actor.id);
    });
  }

  static async rename(sceneId, name) {
    await this.#update(sceneId, (scene, scenes) => {
      scene.name = this.#toUniqueName(name, scenes, sceneId);
    });
  }

  static async addBackground(sceneId, path) {
    await this.#addImage(sceneId, "backgrounds", path);
  }

  static async addHandoutImage(sceneId, path) {
    await this.#addImage(sceneId, "handoutImages", path);
  }

  static async #addImage(sceneId, collectionName, path) {
    await this.#update(sceneId, scene => {
      scene[collectionName].push({
        name: path.split("/").pop(),
        path,
        description: "",
        showDescription: false
      });
    });
  }

  static async updateImageDescription(sceneId, collectionName, index, description) {
    await this.#update(sceneId, scene => {
      const image = scene[collectionName]?.[index];
      if (image) image.description = description;
    });
  }

  static async toggleImageDescription(sceneId, collectionName, index) {
    await this.#update(sceneId, scene => {
      const image = scene[collectionName]?.[index];
      if (image) image.showDescription = image.showDescription !== true;
    });
  }

  static async toggleAutomaticBackground(sceneId, index) {
    await this.#update(sceneId, scene => {
      const selectedBackground = scene.backgrounds[index];
      if (!selectedBackground) return;

      const shouldViewAutomatically = selectedBackground.viewAutomatically !== true;
      scene.backgrounds.forEach((background, backgroundIndex) => {
        background.viewAutomatically = shouldViewAutomatically && backgroundIndex === index;
      });
    });
  }

  static async toggleTrackAutoplay(sceneId, { trackId, playlistId }) {
    await this.#update(sceneId, scene => {
      const matchingTracks = scene.tracks.filter(track => playlistId
        ? track.sourcePlaylistId === playlistId && track.isPlaylistGroup !== false
        : track.id === trackId);
      if (matchingTracks.length === 0) return;

      const isAlreadyAutomatic = matchingTracks.every(track => track.playAutomatically === true);
      scene.tracks.forEach(track => {
        track.playAutomatically = !isAlreadyAutomatic && matchingTracks.includes(track);
      });
    });
  }

  static async moveImage(sceneId, sourceCollection, index) {
    const targetCollection = sourceCollection === "backgrounds" ? "handoutImages" : "backgrounds";
    if (sourceCollection !== "backgrounds" && sourceCollection !== "handoutImages") return;

    await this.#update(sceneId, scene => {
      const [image] = scene[sourceCollection].splice(index, 1);
      if (image && !scene[targetCollection].some(existing => existing.path === image.path)) {
        if (targetCollection === "handoutImages") delete image.viewAutomatically;
        scene[targetCollection].push(image);
      } else if (image) {
        scene[sourceCollection].splice(index, 0, image);
      }
    });
  }

  static async addActor(sceneId, actor) {
    await this.#update(sceneId, scene => {
      if (!scene.actors.some(existing => existing.id === actor.id)) {
        scene.actors.push({
          id: actor.id,
          name: actor.name,
          img: actor.img,
          showName: actor.showName ?? true
        });
      }
    });
  }

  static async updateActor(sceneId, actorId, updates) {
    await this.#update(sceneId, scene => {
      const actor = scene.actors.find(a => a.id === actorId);
      if (actor) Object.assign(actor, updates);
    });
  }

  static async toggleActorName(sceneId, actorId) {
    await this.#update(sceneId, scene => {
      const actor = scene.actors.find(a => a.id === actorId);
      if (actor) {
        actor.showName = actor.showName === undefined ? false : !actor.showName;
      }
    });
  }

  static async addTrack(sceneId, track) {
    await this.#update(sceneId, scene => { scene.tracks.push(track); });
  }

  static async removeBackground(sceneId, index) {
    await this.removeImage(sceneId, "backgrounds", index);
  }

  static async removeImage(sceneId, collectionName, index) {
    if (collectionName !== "backgrounds" && collectionName !== "handoutImages") return;
    await this.#update(sceneId, scene => { scene[collectionName].splice(index, 1); });
  }

  static async removeActor(sceneId, actorId) {
    await this.#update(sceneId, scene => {
      scene.actors = scene.actors.filter(actor => actor.id !== actorId);
    });
  }

  static async removeTrack(sceneId, trackId) {
    await this.#update(sceneId, scene => {
      scene.tracks = scene.tracks.filter(track => track.id !== trackId);
    });
  }

  static async removePlaylistTracks(sceneId, playlistId) {
    await this.#update(sceneId, scene => {
      scene.tracks = scene.tracks.filter(track =>
        track.sourcePlaylistId !== playlistId || track.isPlaylistGroup === false
      );
    });
  }

  /** Appends the lowest free number ("Name 2", "Name 3", ...) when the name is already taken. */
  static #toUniqueName(name, scenes, ignoredSceneId = null) {
    const takenNames = new Set(scenes.filter(scene => scene.id !== ignoredSceneId).map(scene => scene.name));
    if (!takenNames.has(name)) return name;

    let suffix = 2;
    while (takenNames.has(`${name} ${suffix}`)) suffix++;
    return `${name} ${suffix}`;
  }

  static async #update(sceneId, mutate) {
    return this.#queueMutation(async () => {
      const scenes = foundry.utils.deepClone(this.getAll());
      const scene = scenes.find(candidate => candidate.id === sceneId);
      if (!scene) return;

      mutate(scene, scenes);
      await NarrativeSettings.saveAllScenes(scenes);
    });
  }

  static #audioEntryGroups(tracks = []) {
    const groups = [];
    const groupsById = new Map();
    for (const track of tracks) {
      const id = track.sourcePlaylistId && track.isPlaylistGroup !== false
        ? `playlist:${track.sourcePlaylistId}`
        : `sound:${track.id}`;
      let group = groupsById.get(id);
      if (!group) {
        group = { id, tracks: [] };
        groupsById.set(id, group);
        groups.push(group);
      }
      group.tracks.push(track);
    }
    return groups;
  }

  static #moveItems(items, sourceId, targetId, position, getId) {
    const sourceIndex = items.findIndex((item, index) => getId(item, index) === sourceId);
    const targetIndex = items.findIndex((item, index) => getId(item, index) === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;

    const [item] = items.splice(sourceIndex, 1);
    const adjustedTargetIndex = targetIndex - (sourceIndex < targetIndex ? 1 : 0);
    const insertionIndex = adjustedTargetIndex + (position === "after" ? 1 : 0);
    items.splice(insertionIndex, 0, item);
    return true;
  }

  static #queueMutation(mutation) {
    const queuedMutation = this.#mutationQueue.then(mutation);
    this.#mutationQueue = queuedMutation.catch(() => {});
    return queuedMutation;
  }
}

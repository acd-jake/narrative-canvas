import { NarrativeSettings } from "./settings.js";

/**
 * Persistence gateway for narrative scenes.
 * Every mutation reads the stored scenes, applies one change and saves the result.
 */
export class NarrativeSceneRepository {
  static #mutationQueue = Promise.resolve();

  /** @returns {object[]} All stored scenes with healed tracks and assets. */
  static getAll() {
    const raw = NarrativeSettings.getAllScenes() ?? [];
    return raw.map(scene => this.#healScene(scene));
  }

  static #healScene(scene) {
    if (!scene) return scene;
    if (Array.isArray(scene.backgrounds)) {
      scene.backgrounds.forEach(background => {
        background.description ??= "";
        background.showDescription ??= false;
        background.displayMode ??= "background";
      });
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

    // 1. Look up track in game.playlists if name or path is missing
    if ((!track.name || !track.path) && track.id) {
      const playlists = game.playlists ?? game.collections?.get("Playlist");
      if (playlists) {
        for (const pl of playlists) {
          const sound = pl.sounds?.get(track.id);
          if (sound) {
            track.name ||= sound.name;
            track.path ||= sound.path;
            break;
          }
        }
      }
    }

    // 2. Check by track.uuid if available
    if ((!track.name || !track.path) && track.uuid) {
      try {
        const sound = foundry.utils.fromUuidSync(track.uuid);
        if (sound) {
          track.name ||= sound.name;
          track.path ||= sound.path;
        }
      } catch (e) {}
    }

    // 3. Fallback to filename if path exists
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

  static async rename(sceneId, name) {
    await this.#update(sceneId, (scene, scenes) => {
      scene.name = this.#toUniqueName(name, scenes, sceneId);
    });
  }

  static async addBackground(sceneId, path) {
    await this.#update(sceneId, scene => {
      scene.backgrounds.push({
        name: path.split("/").pop(),
        path,
        description: "",
        showDescription: false,
        displayMode: "background"
      });
    });
  }

  static async updateBackgroundDescription(sceneId, index, description) {
    await this.#update(sceneId, scene => {
      const background = scene.backgrounds[index];
      if (background) background.description = description;
    });
  }

  static async toggleBackgroundDescription(sceneId, index) {
    await this.#update(sceneId, scene => {
      const background = scene.backgrounds[index];
      if (background) background.showDescription = background.showDescription !== true;
    });
  }

  static async setBackgroundDisplayMode(sceneId, index, displayMode) {
    if (displayMode !== "background" && displayMode !== "journal") return;
    await this.#update(sceneId, scene => {
      const background = scene.backgrounds[index];
      if (background) background.displayMode = displayMode;
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
    await this.#update(sceneId, scene => { scene.backgrounds.splice(index, 1); });
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

  static #queueMutation(mutation) {
    const queuedMutation = this.#mutationQueue.then(mutation);
    this.#mutationQueue = queuedMutation.catch(() => {});
    return queuedMutation;
  }
}

import { NarrativeSettings } from "../services/settings.js";
import { NarrativeSceneRepository } from "../services/scene-repository.js";
import { SceneImageDescriptionEditors } from "../services/background-description-editors.js";
import { JournalAssetBrowser } from "../services/journal-asset-browser.js";
import { JournalDockController } from "../services/journal-dock.js";
import { SceneAudioPreview } from "../services/scene-audio-preview.js";
import { NarrativeLogger } from "../services/logger.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const ANY_ASSET_TYPE = "*";
const PLAYLIST_SOUND_DRAG_TYPE = "application/x-narrative-canvas-playlistsound";

/** Window for editing narrative scenes and forwarding their asset actions. */
export class NarrativeSceneEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  #freeSceneId = null;
  #journalAssets = null;
  #journalAssetsJournalId = null;
  #imageDescriptionEditors;
  #dock;
  #playlistSoundDragHandler = event => {
    if (!(event.target instanceof Element)) return;
    const soundRow = event.target.closest(".sound[data-playlist-id][data-sound-id]");
    if (!soundRow) return;

    const playlist = game.playlists?.get(soundRow.dataset.playlistId);
    const sound = playlist?.sounds?.get(soundRow.dataset.soundId);
    if (!sound) {
      NarrativeLogger.warn("Could not resolve dragged PlaylistSound", {
        playlistId: soundRow.dataset.playlistId,
        soundId: soundRow.dataset.soundId
      });
      event.stopPropagation();
      return;
    }

    const soundDragData = JSON.stringify(sound.toDragData());
    event.dataTransfer?.setData(PLAYLIST_SOUND_DRAG_TYPE, soundDragData);
    event.dataTransfer?.setData("text/plain", soundDragData);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    event.stopPropagation();
    NarrativeLogger.debug("Prepared individual PlaylistSound drag", {
      playlistId: playlist.id,
      soundId: sound.id,
      soundName: sound.name
    });
  };

  constructor(options = {}) {
    super(options);
    this.selectedSceneId = null;
    this.audioPreview = new SceneAudioPreview((entryId, isPlaying) => {
      for (const button of this.element?.querySelectorAll(".btn-audio-preview") ?? []) {
        if (button.dataset.audioEntryId !== entryId) continue;
        const title = game.i18n.localize(isPlaying
          ? "NARRATIVE_CANVAS.Editor.StopAudioPreview"
          : "NARRATIVE_CANVAS.Editor.PreviewAudio");
        button.title = title;
        button.setAttribute("aria-label", title);
        button.innerHTML = `<i class="fas ${isPlaying ? "fa-stop" : "fa-play"}" aria-hidden="true"></i>`;
        button.closest(".audio-entry-badge")?.classList.toggle("is-previewing", isPlaying);
      }
    });
    this.#imageDescriptionEditors = new SceneImageDescriptionEditors(
      (sceneId, collectionName, index, description) =>
        this.#saveImageDescription(sceneId, collectionName, index, description)
    );
    this.#dock = new JournalDockController(this, {
      onDocked: ({ journalId, previousJournalId }) => {
        if (!previousJournalId) this.#freeSceneId = this.selectedSceneId;
        if (journalId !== previousJournalId) this.selectedSceneId = null;
        this.#journalAssetsJournalId = journalId;
        this.#journalAssets = null;
      },
      onReleased: () => {
        this.selectedSceneId = this.#freeSceneId;
        this.#freeSceneId = null;
        this.#journalAssetsJournalId = null;
        this.#journalAssets = null;
      }
    });
    this.#dock.register();
  }

  static DEFAULT_OPTIONS = {
    id: "narrative-scene-editor",
    tag: "div",
    classes: ["acd-nc-editor-window"],
    window: { frame: true, title: "NARRATIVE_CANVAS.Editor.WindowTitle", minimizable: true, resizable: true },
    position: { width: 1050, height: 760 }
  };

  static PARTS = {
    main: { template: "modules/narrative-canvas/templates/scene-editor.hbs" }
  };

  _updatePosition(position) {
    if (this.#dock?.journalId) return position;
    return super._updatePosition(position);
  }

  /** @override */
  async _prepareContext() {
    const journalId = this.#dock.journalId;
    if (journalId && (this.#journalAssetsJournalId !== journalId || !this.#journalAssets)) {
      const journalAssets = await JournalAssetBrowser.getForJournal(journalId);
      if (this.#dock.journalId === journalId) this.#journalAssets = journalAssets;
      this.#journalAssetsJournalId = journalId;
    }

    const scenes = NarrativeSceneRepository.getVisible(journalId).map(scene => ({
      ...scene,
      journalName: scene.journalId
        ? this.#journalNameOf(scene.journalId) ?? scene.journalName
        : scene.journalName,
      backgrounds: (scene.backgrounds ?? []).map(image => this.#imageContext(image)),
      handoutImages: (scene.handoutImages ?? []).map(image => this.#imageContext(image)),
      audioEntries: this.#audioEntries(scene)
    }));

    if (!scenes.some(scene => scene.id === this.selectedSceneId)) {
      this.selectedSceneId = scenes[0]?.id ?? null;
    }

    return {
      allScenes: scenes,
      selectedSceneId: this.selectedSceneId,
      activeScene: scenes.find(scene => scene.id === this.selectedSceneId) ?? null,
      tileSize: NarrativeSettings.getTileSize(),
      isJournalDocked: Boolean(journalId),
      journalAssets: this.#journalAssetsJournalId === journalId
        ? this.#journalAssets ?? { actors: [], images: [] }
        : { actors: [], images: [] }
    };
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.#centerFloatingWindow();
    this.#dock.dockToActiveJournal();
    if (this.#dock.journalId) this.render();
  }

  #centerFloatingWindow() {
    const margin = 24;
    const width = Math.max(1, Math.min(1050, window.innerWidth - margin * 2));
    const height = Math.max(1, Math.min(760, window.innerHeight - margin * 2));
    this.setPosition({
      left: Math.max(margin, (window.innerWidth - width) / 2),
      top: Math.max(margin, (window.innerHeight - height) / 2),
      width,
      height
    });
  }

  /** @override */
  async _onClose(options) {
    document.removeEventListener("dragstart", this.#playlistSoundDragHandler, true);
    await this.#imageDescriptionEditors.destroy();
    await this.audioPreview.stop();
    super._onClose(options);
    this.#dock.release();
  }

  /** @override */
  async _onRender(context, options) {
    super._onRender(context, options);
    if (!this.element) return;
    document.addEventListener("dragstart", this.#playlistSoundDragHandler, true);
    this._dragDrop = this._dragDrop || this.#createDragDrop();
    this._dragDrop.bind(this.element);
    this.#bindListeners();
    await this.#imageDescriptionEditors.mount(this.element);
  }

  #createDragDrop() {
    return new DragDrop({
      dropSelector: ".editor-dropzone",
      permissions: { drop: () => game.user.isGM },
      callbacks: {
        dragover: (event) => event.currentTarget.classList.add("drag-over"),
        dragleave: (event) => event.currentTarget.classList.remove("drag-over"),
        drop: (event) => this.#onAssetDrop(event)
      }
    });
  }

  #bindListeners() {
    const html = this.element;
    this.#bindSceneList(html);
    this.#bindJournalAssets(html);
    this.#bindSceneHeader(html);
    this.#bindImagePickers(html);
    this.#bindSceneImageDrags(html);
    this.#bindTileDeletion(html);
    this.#bindActorNameToggle(html);
    this.#bindImageDescriptionEditor(html);
    this.#bindImageDescriptionVisibility(html);
    this.#bindAutomaticBackground(html);
    this.#bindTrackAutoplay(html);
    this.#bindTileSizeSlider(html);
    this.#bindAudioPreview(html);
  }

  #bindSceneList(html) {
    html.querySelectorAll(".scene-navigation-item").forEach(item => {
      item.addEventListener("click", async (event) => {
        if (event.target.closest(".btn-delete-scene")) return;
        await this.#imageDescriptionEditors.saveAll();
        await this.audioPreview.stop();
        this.selectedSceneId = item.dataset.sceneId;
        await this.render();
      });
    });

    html.querySelector(".btn-create-scene")?.addEventListener("click", async () => {
      await this.#imageDescriptionEditors.saveAll();
      const scene = await NarrativeSceneRepository.create({
        name: game.i18n.localize("NARRATIVE_CANVAS.Editor.NewSceneDefault"),
        journalId: this.#dock.journalId
      });
      this.selectedSceneId = scene.id;
      await this.#refreshViews();
    });

    html.querySelectorAll(".btn-delete-scene").forEach(button => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const sceneId = button.closest(".scene-navigation-item").dataset.sceneId;
        if (this.selectedSceneId === sceneId) this.selectedSceneId = null;
        await this.#persistAndRefresh(() => NarrativeSceneRepository.remove(sceneId));
      });
    });
  }

  #bindJournalAssets(html) {
    html.querySelectorAll(".journal-asset-item").forEach(item => {
      item.addEventListener("dragstart", (event) => {
        const asset = item.dataset.assetType === "Actor"
          ? { type: "Actor", uuid: item.dataset.assetUuid }
          : { type: "Image", path: item.dataset.assetPath, name: item.dataset.assetName };
        event.dataTransfer.setData("text/plain", JSON.stringify(asset));
        event.dataTransfer.effectAllowed = "copy";
      });
    });
  }

  #bindSceneHeader(html) {
    html.querySelector(".input-scene-rename-field")?.addEventListener("change", (event) => {
      const name = event.target.value || game.i18n.localize("NARRATIVE_CANVAS.Editor.NewSceneDefault");
      this.#persistAndRefresh(() => NarrativeSceneRepository.rename(event.target.dataset.sceneId, name));
    });
  }

  #bindImagePickers(html) {
    html.querySelectorAll(".btn-editor-add-image").forEach(button => {
      button.addEventListener("click", (event) => {
        const { sceneId, imageCollection } = event.currentTarget.dataset;
        new FilePicker({
          type: "image",
          classes: ["filepicker", "acd-nc-elevation"],
          callback: (path) => this.#persistAndRefresh(() => this.#addImage(sceneId, imageCollection, path))
        }).browse();
      });
    });
  }

  #bindSceneImageDrags(html) {
    html.querySelectorAll(".background-tile-card").forEach(card => {
      card.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", JSON.stringify({
          type: "SceneImage",
          sceneId: this.selectedSceneId,
          collectionName: card.dataset.imageCollection,
          index: Number(card.dataset.index)
        }));
        event.dataTransfer.effectAllowed = "move";
      });
    });
  }

  #bindTileDeletion(html) {
    html.querySelectorAll(".btn-delete-item").forEach(button => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const card = button.closest(".tile-thumbnail-card");
        const { type, index, id, imageCollection } = card.dataset;
        const sceneId = this.selectedSceneId;
        const removals = {
          SceneImage: () => NarrativeSceneRepository.removeImage(sceneId, imageCollection, Number(index)),
          Actor: () => NarrativeSceneRepository.removeActor(sceneId, id),
          PlaylistSound: () => NarrativeSceneRepository.removeTrack(sceneId, id),
          PlaylistGroup: () => NarrativeSceneRepository.removePlaylistTracks(sceneId, id)
        };
        if (sceneId && removals[type]) {
          if (type === "PlaylistSound" || type === "PlaylistGroup") await this.audioPreview.stop();
          await this.#imageDescriptionEditors.saveAll();
          await this.#persistAndRefresh(removals[type]);
        }
      });
    });
  }

  #bindActorNameToggle(html) {
    html.querySelectorAll(".btn-toggle-actor-name").forEach(button => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actorId = button.closest(".tile-thumbnail-card")?.dataset.id;
        const sceneId = this.selectedSceneId;
        if (sceneId && actorId) {
          await this.#persistAndRefresh(() => NarrativeSceneRepository.toggleActorName(sceneId, actorId));
        }
      });
    });
  }

  #bindImageDescriptionEditor(html) {
    html.querySelectorAll(".btn-edit-background-description").forEach(button => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const card = button.closest(".tile-thumbnail-card");
        const collectionName = card?.dataset.imageCollection;
        const sceneId = this.selectedSceneId;
        const index = Number(card?.dataset.index);
        if (!sceneId || !collectionName || !Number.isInteger(index)) return;

        const popup = card.querySelector(".background-description-popup");
        const isOpen = popup.classList.toggle("is-open");
        card.classList.toggle("is-description-editing", isOpen);
        popup.setAttribute("aria-hidden", String(!isOpen));
        button.setAttribute("aria-expanded", String(isOpen));
        if (isOpen) this.#imageDescriptionEditors.focus(sceneId, collectionName, index);
      });
    });

    html.querySelectorAll(".btn-close-background-description").forEach(button => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const card = button.closest(".tile-thumbnail-card");
        await this.#imageDescriptionEditors.saveAll();
        card?.classList.remove("is-description-editing");
        card?.querySelector(".background-description-popup")?.classList.remove("is-open");
        card?.querySelector(".btn-edit-background-description")?.setAttribute("aria-expanded", "false");
        card?.querySelector(".background-description-popup")?.setAttribute("aria-hidden", "true");
      });
    });
  }

  #bindImageDescriptionVisibility(html) {
    html.querySelectorAll(".btn-toggle-background-description-visibility").forEach(button => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const card = button.closest(".background-tile-card");
        const sceneId = this.selectedSceneId;
        const collectionName = card?.dataset.imageCollection;
        const index = Number(card?.dataset.index);
        if (!sceneId || !collectionName || !Number.isInteger(index)) return;
        await this.#persistAndRefresh(() => NarrativeSceneRepository.toggleImageDescription(sceneId, collectionName, index));
      });
    });
  }

  #bindAutomaticBackground(html) {
    html.querySelectorAll(".btn-toggle-automatic-background").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const card = button.closest(".background-tile-card");
        const sceneId = this.selectedSceneId;
        const index = Number(card?.dataset.index);
        if (!sceneId || !Number.isInteger(index)) return;

        await this.#persistAndRefresh(() =>
          NarrativeSceneRepository.toggleAutomaticBackground(sceneId, index)
        );
      });
    });
  }

  #bindTrackAutoplay(html) {
    html.querySelectorAll(".btn-toggle-track-autoplay").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();

        const audioEntry = button.closest(".audio-entry-badge");
        const sceneId = this.selectedSceneId;
        if (!sceneId || !audioEntry) return;

        const isPlaylist = audioEntry.dataset.type === "PlaylistGroup";
        await this.#persistAndRefresh(() => NarrativeSceneRepository.toggleTrackAutoplay(sceneId, {
          trackId: isPlaylist ? null : audioEntry.dataset.id,
          playlistId: isPlaylist ? audioEntry.dataset.id : null
        }));
      });
    });
  }

  #plainText(html) {
    return new DOMParser().parseFromString(html || "", "text/html").body.textContent?.trim() ?? "";
  }

  #imageContext(image) {
    const descriptionTooltip = this.#plainText(image.description);
    return { ...image, descriptionTooltip, hasDescription: Boolean(descriptionTooltip) };
  }

  #addImage(sceneId, collectionName, path) {
    return collectionName === "handoutImages"
      ? NarrativeSceneRepository.addHandoutImage(sceneId, path)
      : NarrativeSceneRepository.addBackground(sceneId, path);
  }

  #bindTileSizeSlider(html) {
    html.querySelector(".slider-tile-scale")?.addEventListener("input", (event) => {
      const size = parseInt(event.target.value);
      html.querySelector(".narrative-editor-window")?.style.setProperty("--nc-tile-size", `${size}px`);
      NarrativeSettings.setTileSize(size);
    });
  }

  #bindAudioPreview(html) {
    html.addEventListener("click", async (event) => {
      const button = event.target.closest(".btn-audio-preview");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const badge = button.closest(".audio-entry-badge");
      await this.audioPreview.toggle({
        id: button.dataset.audioEntryId,
        type: badge.dataset.audioType,
        playlistId: badge.dataset.playlistId,
        path: badge.dataset.audioPath
      });
    });
  }

  #audioEntries(scene) {
    const entries = [];
    const seenPlaylists = new Set();
    for (const track of scene.tracks ?? []) {
      if (track.sourcePlaylistId && track.isPlaylistGroup !== false) {
        if (seenPlaylists.has(track.sourcePlaylistId)) continue;
        seenPlaylists.add(track.sourcePlaylistId);
        const playlistTracks = (scene.tracks ?? []).filter(item =>
          item.sourcePlaylistId === track.sourcePlaylistId && item.isPlaylistGroup !== false
        );
        entries.push({
          id: track.sourcePlaylistId,
          entryId: `playlist:${track.sourcePlaylistId}`,
          type: "playlist",
          isPlayable: true,
          playlistId: track.sourcePlaylistId,
          repositoryType: "PlaylistGroup",
          name: track.sourcePlaylistName || track.name,
          playAutomatically: playlistTracks.length > 0
            && playlistTracks.every(item => item.playAutomatically === true),
          isPreviewing: this.audioPreview.activeEntryId === `playlist:${track.sourcePlaylistId}`
        });
      } else {
        entries.push({
          id: track.id,
          entryId: `sound:${track.id}`,
          type: "sound",
          repositoryType: "PlaylistSound",
          name: track.name,
          path: track.path,
          isPlayable: Boolean(track.sourcePlaylistId),
          playAutomatically: track.playAutomatically === true,
          isPreviewing: this.audioPreview.activeEntryId === `sound:${track.id}`
        });
      }
    }
    return entries;
  }

  async #onAssetDrop(event) {
    const dropzone = event.currentTarget;
    event.stopPropagation();
    dropzone.classList.remove("drag-over");
    const { type: dropzoneType, sceneId, imageCollection } = dropzone.dataset;

    try {
      const soundDragData = event.dataTransfer.getData(PLAYLIST_SOUND_DRAG_TYPE);
      const raw = JSON.parse(soundDragData || event.dataTransfer.getData("text/plain"));
      NarrativeLogger.debug("Scene editor received dropped asset", {
        type: raw.type,
        uuid: raw.uuid,
        usedPlaylistSoundPayload: Boolean(soundDragData)
      });
      if (raw.type === "SceneImage") {
        if (raw.sceneId !== sceneId || raw.collectionName === imageCollection || !imageCollection) return;
        await this.#persistAndRefresh(() => NarrativeSceneRepository.moveImage(sceneId, raw.collectionName, raw.index));
        return;
      }

      const asset = await this.#toSceneAsset(raw);
      if (asset?.type === "background") {
        if (imageCollection) {
          await this.#persistAndRefresh(() => this.#addImage(sceneId, imageCollection, asset.path));
        } else if (sceneId) {
          return;
        }
        if (sceneId) return;
      }

      if (asset?.type === "Actor" || asset?.type === "PlaylistSound") {
        const targetSceneId = sceneId || await this.#createSceneFor(asset);
        await this.#persistAndRefresh(() => asset.addTo(targetSceneId));
        return;
      }

      if (!asset || (dropzoneType !== ANY_ASSET_TYPE && asset.type !== dropzoneType)) return;

      const targetSceneId = sceneId || await this.#createSceneFor(asset);
      await this.#persistAndRefresh(() => asset.addTo(targetSceneId));
    } catch (error) {
      console.error("Narrative Canvas | Drop error:", error);
    }
  }

  async #toSceneAsset(dropped) {
    if (!dropped) return null;
    let doc = null;
    if (dropped.uuid) {
      try {
        doc = await foundry.utils.fromUuid(dropped.uuid);
      } catch (error) {
        console.warn("Narrative Canvas | Failed to resolve dropped UUID:", dropped.uuid, error);
      }
    }

    if (dropped.type === "Actor" || doc?.documentName === "Actor") {
      const actor = doc || game.actors.get(dropped.id) || game.actors.get(dropped.uuid?.split(".").pop());
      if (!actor) return null;
      return {
        type: "Actor",
        name: actor.name,
        addTo: (sceneId) => NarrativeSceneRepository.addActor(sceneId, {
          id: actor.id,
          name: actor.name,
          img: actor.img,
          showName: true
        })
      };
    }

    if (dropped.type === "Image" || doc?.documentName === "JournalEntryPage") {
      const path = dropped.path || doc?.src || doc?.image?.src;
      if (!path) return null;
      return {
        type: "background",
        name: dropped.name || doc?.name || "Image",
        path,
        addTo: (sceneId) => NarrativeSceneRepository.addBackground(sceneId, path)
      };
    }

    if (dropped.type === "PlaylistSound" || doc?.documentName === "PlaylistSound") {
      const playlists = game.playlists ?? game.collections?.get("Playlist");
      let soundDoc = doc?.documentName === "PlaylistSound" ? doc : null;
      let playlist = soundDoc?.parent?.sounds?.has(soundDoc.id) ? soundDoc.parent : null;
      if (!playlist && dropped.playlistId) playlist = playlists?.get(dropped.playlistId) ?? null;
      if (!playlist && playlists) {
        const soundId = soundDoc?.id ?? dropped.id;
        const soundPath = soundDoc?.path ?? dropped.path;
        playlist = Array.from(playlists).find(candidate =>
          candidate.sounds?.has(soundId)
          || Array.from(candidate.sounds ?? []).some(sound => sound.path === soundPath)
        ) ?? null;
      }
      if (!soundDoc) {
        soundDoc = playlist?.sounds?.get(dropped.id)
          ?? Array.from(playlist?.sounds ?? []).find(sound => sound.path === dropped.path)
          ?? null;
      }
      if (!soundDoc || !playlist) {
        NarrativeLogger.warn("Ignoring dropped audio that is not an existing Foundry PlaylistSound", {
          droppedId: dropped.id,
          droppedName: dropped.name,
          droppedPath: dropped.path
        });
        return null;
      }

      const name = soundDoc.name || dropped.name || "Track";
      const path = soundDoc.path;
      if (!path) return null;
      const track = {
        id: soundDoc.id,
        name,
        path,
          isPlaylistGroup: false,
        sourcePlaylistId: playlist.id,
        sourcePlaylistName: playlist.name,
        uuid: soundDoc.uuid
      };
      return {
        type: "PlaylistSound",
        name: track.name,
        addTo: (sceneId) => NarrativeSceneRepository.addTrack(sceneId, track)
      };
    }

    if (dropped.type === "Playlist" || doc?.documentName === "Playlist") {
      const playlist = doc || (dropped.id ? game.playlists?.get(dropped.id) : null);
      const sounds = Array.from(playlist?.sounds ?? []);
      if (!sounds.length) return null;
      return {
        type: "PlaylistSound",
        name: playlist.name,
        addTo: async (sceneId) => {
          for (const sound of sounds) {
            if (sound.path) {
              await NarrativeSceneRepository.addTrack(sceneId, {
                id: sound.id,
                name: sound.name,
                path: sound.path,
                isPlaylistGroup: true,
                uuid: sound.uuid,
                sourcePlaylistId: playlist.id,
                sourcePlaylistName: playlist.name
              });
            }
          }
        }
      };
    }
    return null;
  }

  async #createSceneFor(asset) {
    const journalId = this.#dock.journalId;
    const scene = await NarrativeSceneRepository.create({
      name: this.#journalNameOf(journalId) || asset.name,
      journalId
    });
    this.selectedSceneId = scene.id;
    return scene.id;
  }

  #journalNameOf(journalId) {
    return journalId ? game.collections.get("JournalEntry").get(journalId)?.name : undefined;
  }

  async #persistAndRefresh(change) {
    await this.#imageDescriptionEditors.saveAll();
    await change();
    await this.#refreshViews();
  }

  async #refreshViews() {
    const scrollPositions = this.#captureScrollPositions();
    await this.render();
    this.#restoreScrollPositions(scrollPositions);
    await this.#refreshDirector();
  }

  #captureScrollPositions() {
    return [...this.element.querySelectorAll("[data-scroll-region]")].map(element => ({
      region: element.dataset.scrollRegion,
      top: element.scrollTop,
      left: element.scrollLeft
    }));
  }

  #restoreScrollPositions(scrollPositions) {
    for (const position of scrollPositions) {
      const element = this.element.querySelector(`[data-scroll-region="${position.region}"]`);
      if (!element) continue;

      element.scrollTop = position.top;
      element.scrollLeft = position.left;
    }
  }

  async #saveImageDescription(sceneId, collectionName, index, description) {
    await NarrativeSceneRepository.updateImageDescription(sceneId, collectionName, index, description);
    this.#updateImageDescriptionIndicator(sceneId, collectionName, index, description);
    await this.#refreshDirector();
  }

  #updateImageDescriptionIndicator(sceneId, collectionName, index, description) {
    if (this.selectedSceneId !== sceneId || !this.element) return;
    const card = [...this.element.querySelectorAll(".background-tile-card")]
      .find(candidate => candidate.dataset.imageCollection === collectionName
        && Number(candidate.dataset.index) === index);
    const button = card?.querySelector(".btn-edit-background-description");
    if (!button) return;

    const descriptionText = this.#plainText(description);
    const hasDescription = Boolean(descriptionText);
    const action = game.i18n.localize(hasDescription
      ? "NARRATIVE_CANVAS.Editor.EditBackgroundDescription"
      : "NARRATIVE_CANVAS.Editor.AddBackgroundDescription");
    button.classList.toggle("is-active", hasDescription);
    button.title = descriptionText ? `${action}: ${descriptionText}` : action;
    button.setAttribute("aria-label", button.title);
    button.querySelector("i").className = `fas ${hasDescription ? "fa-comment-dots" : "fa-comment"}`;
  }

  async #refreshDirector() {
    const manager = game.modules.get("narrative-canvas").manager;
    if (!manager) return;
    const scenes = NarrativeSceneRepository.getAll();
    const currentSceneData = scenes.find(scene => scene.id === manager.narrativeState.activeSceneId) || null;
    await manager.handleDisplayUpdate({ scenesList: scenes, currentSceneData });
  }
}

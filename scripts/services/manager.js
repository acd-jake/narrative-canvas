import { NarrativeSocket } from "./socket.js";
import { NarrativeSettings } from "./settings.js";
import { NarrativeControls } from "./controls.js";
import { NarrativeSceneRepository } from "./scene-repository.js";
import { JournalAssetBrowser } from "./journal-asset-browser.js";
import { NarrativePlayer } from "../ui/narrative-player.js";
import { NarrativeDirector } from "../ui/narrative-director.js";
import { NarrativeSceneEditor } from "../ui/scene-editor.js";
import { NarrativeLogger } from "./logger.js";
import { PlaylistAudioMixer } from "./playlist-audio-mixer.js";
import { ThemeManager } from "./themes/theme-manager.js";
import { NarrativeActiveStateStore } from "./active-state-store.js";
import { NarrativeDirectorActions } from "./director-actions.js";

export class NarrativeManager {
  #journalAssetRequestId = 0;
  #playerAudioMixer = new PlaylistAudioMixer();
  #playerAudioVolume = 1;
  #playerAudioMuted = false;

  constructor() {
    this.narrativeState = {
      active: false,
      playerViewActive: false,
      background: "",
      handoutImage: "",
      handoutImageOverlays: [],
      journalImage: null,
      activeDialogue: null,
      handout: null,
      isVisualNovelOverlayVisible: true,
      dialogueSystemEnabled: false,
      dialogueVoice: false,
      dialogueLine: null,
      actorLayoutOverride: null,
      handoutLayoutOverride: null,
      actorDialoguePositionModeOverride: null,

      activeSceneId: "",
      currentSceneData: null,
      journalViewerId: NarrativeSettings.getJournalViewerState().journalId,
      activeActors: [],        // Characters currently shown on stage
      activeSpeakerId: null,   // Currently active speaker actor ID
      activeTrackId: null,
      globalVolume: 0.5,
      audioMuted: false,
      themeOverrideId: "",     // Temporary GM theme choice; not persisted, "" uses the module setting
      scenesList: []
    };
    this.view = null;
    this.editorApp = null;
    this.playerCanvasDismissed = false;
    this.directorActions = new NarrativeDirectorActions({
      getState: () => this.narrativeState,
      handleDisplayUpdate: (update, isRemote) => this.handleDisplayUpdate(update, isRemote),
      handleHandoutImageLayout: (layout, isFinal) => this.handleHandoutImageLayout(layout, isFinal),
      activateSceneAudio: sceneData => this.view?.activateSceneAudio?.(sceneData),
      reopenPlayerCanvases: () => this.reopenPlayerCanvasesForPlayers(),
      toggleCanvasState: active => this.toggleCanvasState(active),
      addHandoutImageOverlay: image => this.#addHandoutImageOverlay(image)
    });
    this.activeStateStore = new NarrativeActiveStateStore({
      addHandoutImageOverlay: (image, overlays) => this.#addHandoutImageOverlay(image, overlays)
    });
  }

  async refreshView() {
    // Populate scene dropdown array compilation dynamically on refresh step
    this.narrativeState.scenesList = NarrativeSceneRepository.getAll();
    if (this.narrativeState.activeSceneId) {
      this.#journalAssetRequestId++;
      this.narrativeState.currentSceneData = this.narrativeState.scenesList.find(s => s.id === this.narrativeState.activeSceneId) || null;
    } else {
      await this.#refreshJournalSceneData();
    }

    if (!game.user.isGM) {
      this.#playerAudioMixer.setSceneTracks(this.narrativeState.currentSceneData?.tracks ?? []);
      this.#applyPlayerAudioMix();
    }

    // Synchronize active actors and current scene actor statuses
    if (this.narrativeState.currentSceneData?.actors) {
      const activeIds = new Set(this.narrativeState.activeActors.map(a => a.id));
      this.narrativeState.currentSceneData.actors.forEach(actor => {
        actor.isOnStage = activeIds.has(actor.id);
        actor.isActiveOnCanvas = actor.isOnStage;
        actor.isSpeaker = this.narrativeState.activeSpeakerId === actor.id;
        actor.showName = actor.showName !== false;
      });

      // Update activeActors to mirror current scene data & speaker status
      this.narrativeState.activeActors = this.narrativeState.activeActors.map(active => {
        const sceneActor = this.narrativeState.currentSceneData.actors.find(a => a.id === active.id);
        return {
          ...active,
          name: sceneActor?.name ?? active.name,
          img: sceneActor?.img ?? active.img,
          showName: sceneActor ? (sceneActor.showName !== false) : (active.showName !== false),
          isSpeaker: this.narrativeState.activeSpeakerId === active.id
        };
      });
    }

    NarrativeControls.setCanvasControlEnabled(
      game.user.isGM || Boolean(this.narrativeState.playerViewActive)
    );

    const shouldRender = game.user.isGM
      ? this.narrativeState.active
      : this.narrativeState.playerViewActive && !this.playerCanvasDismissed;
    if (shouldRender) {
      await ThemeManager.activate(this.narrativeState.themeOverrideId || NarrativeSettings.getThemeId());
      if (!this.view) {
        this.view = game.user.isGM
          ? new NarrativeDirector(this._getGMCallbacks())
          : new NarrativePlayer({
            onClose: () => this.closePlayerCanvas(),
            onAudioVolumeChange: volume => this.setPlayerAudioVolume(volume),
            onAudioMuteChange: muted => this.setPlayerAudioMuted(muted)
          });
      }
      const renderState = game.user.isGM ? this.narrativeState : {
        ...this.narrativeState,
        playerAudioVolume: this.#playerAudioVolume,
        playerAudioVolumePercent: Math.round(this.#playerAudioVolume * 100),
        playerAudioMuted: this.#playerAudioMuted
      };
      await this.view.render(renderState);
    } else {
      if (this.view) {
        const closingView = this.view;
        this.view = null;
        await closingView.close({ isLocalDismissal: !game.user.isGM && this.playerCanvasDismissed });
      }
    }
  }

  async #refreshJournalSceneData() {
    const journalId = this.narrativeState.journalViewerId;
    if (!journalId) {
      this.#journalAssetRequestId++;
      this.narrativeState.currentSceneData = null;
      return;
    }

    const currentSceneData = this.narrativeState.currentSceneData;
    if (currentSceneData?.isJournalAssetSource && currentSceneData.journalId === journalId) return;

    const requestId = ++this.#journalAssetRequestId;
    this.narrativeState.currentSceneData = null;
    const { actors, images } = await JournalAssetBrowser.getForJournal(journalId);
    if (requestId !== this.#journalAssetRequestId
      || this.narrativeState.activeSceneId
      || this.narrativeState.journalViewerId !== journalId) return;

    this.narrativeState.currentSceneData = {
      id: `journal:${journalId}`,
      journalId,
      isJournalAssetSource: true,
      actors: actors.map(actor => ({ ...actor, showName: true })),
      backgrounds: [],
      handoutImages: images.map((image, index) => ({
        ...image,
        id: `journal-handout-${index}`,
        description: "",
        showDescription: false
      })),
      tracks: []
    };
  }

  /**
   * Local toggle action invoked from the Scene Controls button.
   * @param {boolean} active 
   */
  async toggleCanvasState(active) {
    if (game.user.isGM) {
      if (active && this.narrativeState.active) {
        await this.view?.render(this.narrativeState);
        NarrativeSocket.emit("UPDATE_DISPLAY", this.narrativeState);
        return;
      }

      if (active) {
        this.narrativeState.actorLayoutOverride = null;
        this.narrativeState.handoutLayoutOverride = null;
        this.narrativeState.actorDialoguePositionModeOverride = null;
        this.restorePersistedState();
      }

      this.narrativeState.active = active;
      if (!active) {
        this.narrativeState.playerViewActive = false;
        this.narrativeState.actorLayoutOverride = null;
        this.narrativeState.handoutLayoutOverride = null;
        this.narrativeState.actorDialoguePositionModeOverride = null;
        await this.persistActiveState();
      }

      NarrativeSocket.emit("UPDATE_DISPLAY", this.narrativeState);
      await this.refreshView();
      if (active && this.narrativeState.activeSceneId && this.narrativeState.currentSceneData) {
        await this.view?.activateSceneAudio?.(this.narrativeState.currentSceneData);
      }
    } else {
      if (active) await this.openPlayerCanvas();
    }
  }

  async openPlayerCanvas() {
    if (game.user.isGM || !this.narrativeState.playerViewActive) return;

    this.playerCanvasDismissed = false;
    await this.refreshView();
  }

  setPlayerAudioVolume(volume) {
    this.#playerAudioVolume = Math.max(0, Math.min(1, Number(volume) || 0));
    this.#applyPlayerAudioMix();
  }

  setPlayerAudioMuted(muted) {
    this.#playerAudioMuted = Boolean(muted);
    this.#applyPlayerAudioMix();
  }

  #applyPlayerAudioMix() {
    this.#playerAudioMixer.globalVolume = this.narrativeState.globalVolume * this.#playerAudioVolume;
    this.#playerAudioMixer.muted = Boolean(this.narrativeState.audioMuted) || this.#playerAudioMuted;
  }

  async reopenPlayerCanvas() {
    if (game.user.isGM || !this.narrativeState.playerViewActive || !this.playerCanvasDismissed) return;

    await this.openPlayerCanvas();
  }

  reopenPlayerCanvasesForPlayers() {
    if (!game.user.isGM || !this.narrativeState.playerViewActive) return;

    NarrativeSocket.emit("REOPEN_PLAYER_CANVAS", {});
  }

  async closePlayerCanvas() {
    if (game.user.isGM || !this.narrativeState.playerViewActive) return;

    this.playerCanvasDismissed = true;
    await this.refreshView();
  }

  /**
   * Direct target synchronization. Sends the full state context payload to a newly logged-in user.
   * @param {string} targetUserId - The ID of the client requesting the state sync
   */
  sendCurrentStateToUser(targetUserId) {
    if (!game.user.isGM) return;
    NarrativeLogger.info("Sending current Canvas state to client", {
      targetUserId,
      canvasActive: this.narrativeState.active,
      playerViewActive: this.narrativeState.playerViewActive
    });
    NarrativeSocket.emit("SYNC_STATE", this.narrativeState, targetUserId);
  }

  /**
   * Mutates and synchronizes incoming data changes, handling both local updates and network events.
   * @param {object} data - Object slice containing state mutations
   * @param {boolean} [isRemote=false] - Flag indicating if the update came from the socket pipeline
   */
  async handleDisplayUpdate(data, isRemote = false) {
    if (!game.user.isGM && data.playerViewActive === false) {
      this.playerCanvasDismissed = false;
    }

    this.narrativeState = { ...this.narrativeState, ...data };
    if (game.user.isGM && !isRemote) {
      NarrativeSocket.emit("UPDATE_DISPLAY", data);
      await this.persistActiveState();
    }
    await this.refreshView();
  }

  async handleHandoutImageLayout(layout, isFinal = false, isRemote = false) {
    if (!Array.isArray(layout)) return;

    const overlaysById = new Map(
      (this.narrativeState.handoutImageOverlays || []).map(overlay => [overlay.id, overlay])
    );
    const includedIds = new Set();
    const orderedOverlays = layout.flatMap((item, zOrder) => {
      const overlay = overlaysById.get(item.id);
      if (!overlay) return [];

      const x = Number(item.position?.x);
      const y = Number(item.position?.y);
      const size = Number(item.size);
      includedIds.add(item.id);
      return [{
        ...overlay,
        position: {
          x: Number.isFinite(x) ? x : 0.5,
          y: Number.isFinite(y) ? y : 0.5
        },
        size: Number.isFinite(size) ? Math.max(0.25, Math.min(1.5, size)) : overlay.size ?? 1,
        zOrder
      }];
    });

    for (const overlay of overlaysById.values()) {
      if (!includedIds.has(overlay.id)) {
        orderedOverlays.push({ ...overlay, zOrder: orderedOverlays.length });
      }
    }

    this.narrativeState = { ...this.narrativeState, handoutImageOverlays: orderedOverlays };
    if (isRemote) {
      this.view?.applyHandoutImageLayout(layout);
      return;
    }

    if (!game.user.isGM) return;
    NarrativeSocket.emit("HANDOUT_IMAGE_LAYOUT", { layout, isFinal });
    if (isFinal) await this.persistActiveState();
  }

  /**
   * Persists the current active state (scene, background, active actors, active speaker)
   * so it can be restored on world reload or upon opening the canvas.
   */
  async persistActiveState() {
    await this.activeStateStore.persist(this.narrativeState);
  }

  /**
   * Restores and reconciles persisted active state against existing world scenes and actors.
   * Validates that scenes and actors still exist before applying them.
   */
  restorePersistedState() {
    this.activeStateStore.restore(this.narrativeState);
  }

  _getGMCallbacks() {
    return this.directorActions.createCallbacks();
  }

  #addHandoutImageOverlay(image, currentOverlays = this.narrativeState.handoutImageOverlays || []) {
    const overlays = currentOverlays;
    const existingOverlay = overlays.find(overlay => overlay.src === image.src);
    if (existingOverlay) {
      const updatedOverlay = {
        ...existingOverlay,
        ...image,
        id: existingOverlay.id,
        title: image.title || "",
        description: image.description || "",
        showDescription: image.showDescription === true
      };
      return [...overlays.filter(overlay => overlay.id !== existingOverlay.id), updatedOverlay];
    }

    return [...overlays, {
      id: `handout-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      src: image.src,
      title: image.title || "",
      description: image.description || "",
      showDescription: image.showDescription === true,
      size: Number.isFinite(image.size) ? Math.max(0.25, Math.min(1.5, image.size)) : 1
    }];
  }


  /**
   * Shuts down the canvas display if the active GM disconnects.
   */
  async forceShutdownDueToGMDisconnect() {
    await this.#playerAudioMixer.stopLocalAll();
    this.#playerAudioMixer.destroy();
    this.narrativeState.active = false;
    this.narrativeState.playerViewActive = false;
    if (this.view) {
      const closingView = this.view;
      this.view = null;
      await closingView.close();
    }
    if (NarrativeSettings.areToastsEnabled()) {
      ui.notifications.warn(game.i18n.localize("NARRATIVE_CANVAS.Notifications.GMDisconnected"));
    }
  }

  /**
   * Opens the scene editor, or closes it if it is already open. GM only.
   */
  toggleEditorWindow() {
    if (!game.user.isGM) return;

    if (this.editorApp && this.editorApp.rendered) {
      this.editorApp.close();
    } else {
      if (!this.editorApp) this.editorApp = new NarrativeSceneEditor();
      this.editorApp.render({ force: true });
    }
  }
}
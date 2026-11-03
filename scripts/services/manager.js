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

export class NarrativeManager {
  #journalAssetRequestId = 0;
  #playerAudioMixer = new PlaylistAudioMixer();

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

      activeSceneId: "",
      currentSceneData: null,
      journalViewerId: NarrativeSettings.getJournalViewerState().journalId,
      activeActors: [],        // Characters currently shown on stage
      activeSpeakerId: null,   // Currently active speaker actor ID
      activeTrackId: null,
      globalVolume: 0.5,
      audioMuted: false,
      scenesList: []
    };
    this.view = null;
    this.editorApp = null;
    this.playerCanvasDismissed = false;
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
      this.#playerAudioMixer.globalVolume = this.narrativeState.globalVolume;
      this.#playerAudioMixer.muted = this.narrativeState.audioMuted;
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
      if (!this.view) {
        this.view = game.user.isGM
          ? new NarrativeDirector(this._getGMCallbacks())
          : new NarrativePlayer({ onClose: () => this.closePlayerCanvas() });
      }
      await this.view.render(this.narrativeState);
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
        this.restorePersistedState();
      }

      this.narrativeState.active = active;
      if (!active) {
        this.narrativeState.playerViewActive = false;
        await this.persistActiveState();
      }

      NarrativeSocket.emit("UPDATE_DISPLAY", this.narrativeState);
      await this.refreshView();
    } else {
      if (active) await this.openPlayerCanvas();
    }
  }

  async openPlayerCanvas() {
    if (game.user.isGM || !this.narrativeState.playerViewActive) return;

    this.playerCanvasDismissed = false;
    await this.refreshView();
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
    if (!game.user.isGM) return;

    const payload = {
      activeSceneId: this.narrativeState.activeSceneId || "",
      background: this.narrativeState.background || "",
      handoutImage: this.narrativeState.handoutImage || "",
      handoutImageOverlays: (this.narrativeState.handoutImageOverlays || []).map((overlay, index) => ({
        id: overlay.id,
        src: overlay.src,
        title: overlay.title || "",
        description: overlay.description || "",
        showDescription: overlay.showDescription === true,
        size: Number.isFinite(overlay.size) ? Math.max(0.25, Math.min(1.5, overlay.size)) : 1,
        ...(Number.isFinite(overlay.position?.x) && Number.isFinite(overlay.position?.y)
          ? { position: { x: overlay.position.x, y: overlay.position.y } }
          : {}),
        zOrder: Number.isFinite(overlay.zOrder) ? overlay.zOrder : index
      })),
      activeActors: (this.narrativeState.activeActors || []).map(actor => ({
        id: actor.id,
        name: actor.name,
        img: actor.img,
        showName: actor.showName !== false
      })),
      activeSpeakerId: this.narrativeState.activeSpeakerId || null
    };

    await NarrativeSettings.saveActiveState(payload);
  }

  /**
   * Restores and reconciles persisted active state against existing world scenes and actors.
   * Validates that scenes and actors still exist before applying them.
   */
  restorePersistedState() {
    const saved = NarrativeSettings.getActiveState();
    if (!saved || typeof saved !== "object") return;

    const scenes = NarrativeSceneRepository.getAll();
    let validatedSceneId = "";
    let validatedSceneData = null;

    if (saved.activeSceneId) {
      validatedSceneData = scenes.find(s => s.id === saved.activeSceneId) || null;
      if (validatedSceneData) {
        validatedSceneId = validatedSceneData.id;
      }
    }

    const savedHandoutImage = saved.handoutImage
      || (saved.backgroundDisplayMode === "journal" ? saved.background : "");
    let validatedBackground = "";
    if (typeof saved.background === "string" && saved.background.trim()) {
      if (saved.backgroundDisplayMode === "journal") {
        validatedBackground = "";
      } else if (validatedSceneData?.backgrounds?.length) {
        const bgExists = validatedSceneData.backgrounds.some(bg => bg.path === saved.background);
        if (bgExists) {
          validatedBackground = saved.background;
        }
      } else {
        validatedBackground = saved.background;
      }
    }

    const validatedHandoutImage = validatedSceneData?.handoutImages?.length
      ? validatedSceneData.handoutImages.some(image => image.path === savedHandoutImage) ? savedHandoutImage : ""
      : savedHandoutImage;

    // Validate active actors against the active scene actors
    let validatedActors = [];
    if (Array.isArray(saved.activeActors) && saved.activeActors.length) {
      if (validatedSceneData?.actors?.length) {
        const sceneActorMap = new Map(validatedSceneData.actors.map(a => [a.id, a]));
        for (const savedActor of saved.activeActors) {
          const matched = sceneActorMap.get(savedActor.id);
          if (matched) {
            validatedActors.push({
              id: matched.id,
              name: matched.name,
              img: matched.img,
              showName: matched.showName !== false
            });
          }
        }
      } else if (!saved.activeSceneId) {
        validatedActors = saved.activeActors
          .filter(actor => typeof actor?.id === "string" && typeof actor.img === "string")
          .map(actor => ({
            id: actor.id,
            name: typeof actor.name === "string" ? actor.name : "",
            img: actor.img,
            showName: actor.showName !== false
          }));
      }
    }

    // Validate active speaker
    let validatedSpeakerId = null;
    if (saved.activeSpeakerId && validatedActors.some(a => a.id === saved.activeSpeakerId)) {
      validatedSpeakerId = saved.activeSpeakerId;
    }

    this.narrativeState.activeSceneId = validatedSceneId;
    this.narrativeState.currentSceneData = validatedSceneData;
    this.narrativeState.background = validatedBackground;
    this.narrativeState.handoutImage = validatedHandoutImage;
    if (Array.isArray(saved.handoutImageOverlays)) {
      this.narrativeState.handoutImageOverlays = saved.handoutImageOverlays
        .filter(overlay => typeof overlay?.src === "string" && overlay.src.trim())
        .map((overlay, index) => {
          const sceneImage = validatedSceneData?.handoutImages
            ?.find(image => image.path === overlay.src);
          const x = Number(overlay.position?.x);
          const y = Number(overlay.position?.y);
          const hasPosition = Number.isFinite(x) && Number.isFinite(y);

          return {
            id: typeof overlay.id === "string" ? overlay.id : `restored-handout-${index}`,
            src: overlay.src,
            title: sceneImage?.name || overlay.title || "",
            description: sceneImage?.description || overlay.description || "",
            showDescription: sceneImage
              ? sceneImage.showDescription === true
              : overlay.showDescription === true,
            size: Number.isFinite(Number(overlay.size))
              ? Math.max(0.25, Math.min(1.5, Number(overlay.size)))
              : 1,
            ...(hasPosition ? {
              position: {
                x,
                y
              }
            } : {}),
            zOrder: Number.isFinite(overlay.zOrder) ? overlay.zOrder : index
          };
        });
    } else {
      this.narrativeState.handoutImageOverlays = [];
      const restoredHandout = validatedSceneData?.handoutImages
        ?.find(image => image.path === validatedHandoutImage);
      if (restoredHandout) {
        this.narrativeState.handoutImageOverlays = this.#addHandoutImageOverlay({
          src: restoredHandout.path,
          title: restoredHandout.name || "",
          description: restoredHandout.description || "",
          showDescription: restoredHandout.showDescription === true
        });
      }
    }
    this.narrativeState.activeActors = validatedActors;
    this.narrativeState.activeSpeakerId = validatedSpeakerId;
  }

  _getGMCallbacks() {
    return {
      onJournalSelect: (journalId) => {
        if (this.narrativeState.journalViewerId === journalId) return;
        this.narrativeState.journalViewerId = journalId;
        if (this.narrativeState.activeSceneId) return;

        this.handleDisplayUpdate({
          journalViewerId: journalId,
          currentSceneData: null,
          activeActors: [],
          activeSpeakerId: null,
          activeTrackId: null
        });
      },
      onSceneSelect: async (sceneId) => {
        const scenes = NarrativeSceneRepository.getAll();
        const selectedData = sceneId ? scenes.find(s => s.id === sceneId) || null : null;
        if (sceneId && !selectedData) return;

        // Retain only actors available from the newly selected source.
        const newSceneActorIds = new Set((selectedData?.actors || []).map(a => a.id));
        const survivingActiveActors = selectedData
          ? (this.narrativeState.activeActors || []).filter(a => newSceneActorIds.has(a.id))
          : [];
        const survivingSpeakerId = selectedData && newSceneActorIds.has(this.narrativeState.activeSpeakerId)
          ? this.narrativeState.activeSpeakerId
          : null;

        const automaticBackground = selectedData?.backgrounds?.find(
          background => background.viewAutomatically === true
        );
        const update = {
          activeSceneId: selectedData?.id || "",
          currentSceneData: selectedData,
          activeActors: survivingActiveActors,
          activeSpeakerId: survivingSpeakerId,
          activeTrackId: null
        };
        if (automaticBackground) update.background = automaticBackground.path;

        await this.handleDisplayUpdate(update);
        await this.view?.activateSceneAudio?.(selectedData);
      },
      onActorStageToggle: (actorId) => {
        const actorData = this.narrativeState.currentSceneData?.actors.find(a => a.id === actorId);
        if (!actorData) return;

        let activeList = [...this.narrativeState.activeActors];
        let activeSpeakerId = this.narrativeState.activeSpeakerId;
        const existingIndex = activeList.findIndex(a => a.id === actorId);

        if (existingIndex > -1) {
          activeList.splice(existingIndex, 1);
          if (activeSpeakerId === actorId) {
            activeSpeakerId = null;
          }
        } else {
          activeList.push({
            id: actorData.id,
            name: actorData.name,
            img: actorData.img,
            showName: actorData.showName !== false,
            isSpeaker: activeSpeakerId === actorData.id
          });
        }

        this.handleDisplayUpdate({ activeActors: activeList, activeSpeakerId });
      },
      onActorStageRemove: (actorId) => {
        const activeList = this.narrativeState.activeActors.filter(a => a.id !== actorId);
        let activeSpeakerId = this.narrativeState.activeSpeakerId;
        if (activeSpeakerId === actorId) {
          activeSpeakerId = null;
        }
        this.handleDisplayUpdate({ activeActors: activeList, activeSpeakerId });
      },
      onActorSpeakerToggle: (actorId) => {
        let activeSpeakerId = this.narrativeState.activeSpeakerId;
        let activeList = [...this.narrativeState.activeActors];

        if (activeSpeakerId === actorId) {
          activeSpeakerId = null;
        } else {
          activeSpeakerId = actorId;
          if (!activeList.some(a => a.id === actorId)) {
            const actorData = this.narrativeState.currentSceneData?.actors.find(a => a.id === actorId);
            if (actorData) {
              activeList.push({
                id: actorData.id,
                name: actorData.name,
                img: actorData.img,
                showName: actorData.showName !== false,
                isSpeaker: true
              });
            }
          }
        }

        activeList = activeList.map(a => ({
          ...a,
          isSpeaker: a.id === activeSpeakerId
        }));

        this.handleDisplayUpdate({ activeActors: activeList, activeSpeakerId });
      },
      onActorToggleName: async (actorId) => {
        const sceneId = this.narrativeState.activeSceneId;
        if (!sceneId) {
          const currentSceneData = this.narrativeState.currentSceneData;
          const actor = currentSceneData?.isJournalAssetSource
            ? currentSceneData.actors.find(item => item.id === actorId)
            : null;
          if (!actor) return;

          const showName = actor.showName === false;
          this.handleDisplayUpdate({
            currentSceneData: {
              ...currentSceneData,
              actors: currentSceneData.actors.map(item => item.id === actorId ? { ...item, showName } : item)
            },
            activeActors: this.narrativeState.activeActors.map(item => item.id === actorId ? { ...item, showName } : item)
          });
          return;
        }

        await NarrativeSceneRepository.toggleActorName(sceneId, actorId);
        const scenes = NarrativeSceneRepository.getAll();
        const updatedScene = scenes.find(s => s.id === sceneId) || null;

        const activeList = this.narrativeState.activeActors.map(a => {
          if (a.id === actorId) {
            const scActor = updatedScene?.actors.find(sa => sa.id === actorId);
            return { ...a, showName: scActor ? scActor.showName !== false : !a.showName };
          }
          return a;
        });

        this.handleDisplayUpdate({
          scenesList: scenes,
          currentSceneData: updatedScene,
          activeActors: activeList
        });
      },
      onDialogueTrigger: (dialogue) => this.handleDisplayUpdate({ activeDialogue: dialogue }),
      onCloseAllHandouts: () => {
        this.handleDisplayUpdate({
          handoutImage: "",
          handoutImageOverlays: []
        });
      },
      onBackgroundReset: () => this.handleDisplayUpdate({ background: "" }),
      onJournalImageShow: (journalImage) => {
        this.handleDisplayUpdate({
          handoutImageOverlays: this.#addHandoutImageOverlay({ ...journalImage, showDescription: true })
        });
      },
      onBackgroundChange: (path) => this.handleDisplayUpdate({ background: path }),
      onHandoutImageChange: (path) => {
        const image = this.narrativeState.currentSceneData?.handoutImages?.find(item => item.path === path);
        if (!image) return;
        this.handleDisplayUpdate({
          handoutImage: path,
          handoutImageOverlays: this.#addHandoutImageOverlay({
            src: image.path,
            title: image.name || "",
            description: image.description || "",
            showDescription: image.showDescription === true
          })
        });
      },
      onHandoutImageClose: (overlayId) => {
        const currentOverlays = this.narrativeState.handoutImageOverlays || [];
        const closingOverlay = currentOverlays.find(overlay => overlay.id === overlayId);
        const remainingOverlays = currentOverlays.filter(overlay => overlay.id !== overlayId);
        const selectedHandoutWasClosed = closingOverlay?.src === this.narrativeState.handoutImage;

        this.handleDisplayUpdate({
          handoutImage: selectedHandoutWasClosed
            ? remainingOverlays[remainingOverlays.length - 1]?.src || ""
            : this.narrativeState.handoutImage,
          handoutImageOverlays: remainingOverlays
        });
      },
      onHandoutImageLayoutChange: (layout, isFinal) =>
        this.handleHandoutImageLayout(layout, isFinal),
      onImageDescriptionToggle: async (collectionName, index) => {
        const sceneId = this.narrativeState.activeSceneId;
        if (!sceneId) return;
        await NarrativeSceneRepository.toggleImageDescription(sceneId, collectionName, index);
        const scenes = NarrativeSceneRepository.getAll();
        const currentSceneData = scenes.find(scene => scene.id === sceneId) || null;
        this.handleDisplayUpdate({
          scenesList: scenes,
          currentSceneData,
          handoutImageOverlays: this.#refreshSceneHandoutOverlays(currentSceneData)
        });
      },
      onTrackPlay: (trackId) => this.handleDisplayUpdate({ activeTrackId: trackId }),
      onVolumeChange: (volume) => this.handleDisplayUpdate({ globalVolume: volume }),
      onAudioMuteChange: (audioMuted) => this.handleDisplayUpdate({ audioMuted }),
      onVisibilityChange: (visible) => this.handleDisplayUpdate(visible
        ? { ...this.narrativeState, playerViewActive: true }
        : { playerViewActive: false }),
      onReopenPlayers: () => this.reopenPlayerCanvasesForPlayers(),
      onShutdown: () => this.toggleCanvasState(false)
    };
  }

  #addHandoutImageOverlay(image) {
    const overlays = this.narrativeState.handoutImageOverlays || [];
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

  #refreshSceneHandoutOverlays(sceneData) {
    return (this.narrativeState.handoutImageOverlays || []).map(overlay => {
      const image = sceneData?.handoutImages?.find(item => item.path === overlay.src);
      if (!image) return overlay;
      return {
        ...overlay,
        description: image.description || "",
        showDescription: image.showDescription === true
      };
    });
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
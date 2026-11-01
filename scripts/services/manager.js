import { NarrativeSocket } from "./socket.js";
import { NarrativeSettings } from "./settings.js";
import { NarrativeSceneRepository } from "./scene-repository.js";
import { NarrativePlayer } from "../ui/narrative-player.js";
import { NarrativeDirector } from "../ui/narrative-director.js";
import { NarrativeSceneEditor } from "../ui/narrative-editor.js";

export class NarrativeManager {
  constructor() {
    this.narrativeState = {
      active: false,
      playerViewActive: false,
      background: "",
      activeDialogue: null,
      handout: null,

      activeSceneId: "",
      currentSceneData: null,
      activeActors: [],        // Characters currently shown on stage
      activeSpeakerId: null,   // Currently active speaker actor ID
      activeTrackId: null,
      globalVolume: 0.5,
      scenesList: []
    };
    this.view = null;
    this.editorApp = null;
  }

  async refreshView() {
    // Populate scene dropdown array compilation dynamically on refresh step
    this.narrativeState.scenesList = NarrativeSceneRepository.getAll();
    if (this.narrativeState.activeSceneId) {
      this.narrativeState.currentSceneData = this.narrativeState.scenesList.find(s => s.id === this.narrativeState.activeSceneId) || null;
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

    const shouldRender = game.user.isGM ? this.narrativeState.active : this.narrativeState.playerViewActive;
    if (shouldRender) {
      if (!this.view) {
        this.view = game.user.isGM ? new NarrativeDirector(this._getGMCallbacks()) : new NarrativePlayer();
      }
      await this.view.render(this.narrativeState);
    } else {
      if (this.view) { this.view.close(); this.view = null; }
    }
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
      if (!active) this.narrativeState.playerViewActive = false;

      await this.refreshView();
      NarrativeSocket.emit("UPDATE_DISPLAY", this.narrativeState);
    } else {
      if (NarrativeSettings.userHasPermission()) {
        this.narrativeState.active = active;
        await this.refreshView();
      }
    }
  }

  /**
   * Direct target synchronization. Sends the full state context payload to a newly logged-in user.
   * @param {string} targetUserId - The ID of the client requesting the state sync
   */
  sendCurrentStateToUser(targetUserId) {
    if (!game.user.isGM) return;
    NarrativeSocket.emit("SYNC_STATE", this.narrativeState, targetUserId);
  }

  /**
   * Mutates and synchronizes incoming data changes, handling both local updates and network events.
   * @param {object} data - Object slice containing state mutations
   * @param {boolean} [isRemote=false] - Flag indicating if the update came from the socket pipeline
   */
  async handleDisplayUpdate(data, isRemote = false) {
    this.narrativeState = { ...this.narrativeState, ...data };
    if (game.user.isGM && !isRemote) {
      NarrativeSocket.emit("UPDATE_DISPLAY", data);
      await this.persistActiveState();
    }
    await this.refreshView();
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

    // Background validation: if saved background is non-empty, verify it exists in the active scene backgrounds
    // or keep it if it is a valid path string.
    let validatedBackground = "";
    if (typeof saved.background === "string" && saved.background.trim()) {
      if (validatedSceneData?.backgrounds?.length) {
        const bgExists = validatedSceneData.backgrounds.some(bg => bg.path === saved.background);
        if (bgExists) {
          validatedBackground = saved.background;
        }
      } else {
        validatedBackground = saved.background;
      }
    }

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
    this.narrativeState.activeActors = validatedActors;
    this.narrativeState.activeSpeakerId = validatedSpeakerId;
  }

  _getGMCallbacks() {
    return {
      onSceneSelect: (sceneId) => {
        const scenes = NarrativeSceneRepository.getAll();
        const selectedData = scenes.find(s => s.id === sceneId) || null;

        // Retain only active actors present in the newly activated scene
        const newSceneActorIds = new Set((selectedData?.actors || []).map(a => a.id));
        const survivingActiveActors = (this.narrativeState.activeActors || []).filter(a => newSceneActorIds.has(a.id));
        const survivingSpeakerId = newSceneActorIds.has(this.narrativeState.activeSpeakerId)
          ? this.narrativeState.activeSpeakerId
          : null;

        // Activating a scene does not alter the canvas background directly.
        // It updates the scene data so background quick-selection reflects the new scene.
        this.handleDisplayUpdate({
          activeSceneId: sceneId,
          currentSceneData: selectedData,
          activeActors: survivingActiveActors,
          activeSpeakerId: survivingSpeakerId,
          activeTrackId: null
        });
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
        if (!sceneId) return;

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
      onClearDisplay: () => {
        this.handleDisplayUpdate({
          background: "",
          activeActors: [],
          activeSpeakerId: null,
          activeDialogue: null,
          handout: null
        });
      },
      onBackgroundChange: (path) => this.handleDisplayUpdate({ background: path }),
      onTrackPlay: (trackId) => this.handleDisplayUpdate({ activeTrackId: trackId }),
      onVolumeChange: (volume) => this.handleDisplayUpdate({ globalVolume: volume }),
      onVisibilityChange: (visible) => this.handleDisplayUpdate({ playerViewActive: visible }),
      onShutdown: () => this.toggleCanvasState(false)
    };
  }

  /**
   * Shuts down the canvas display if the active GM disconnects.
   */
  forceShutdownDueToGMDisconnect() {
    this.narrativeState.active = false;
    this.narrativeState.playerViewActive = false;
    if (this.view) {
      this.view.close();
      this.view = null;
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
import { NarrativeSceneRepository } from "./scene-repository.js";

/**
 * @typedef {object} NarrativeDirectorActionDependencies
 * @property {() => object} getState
 * @property {(update: object) => Promise<void>} handleDisplayUpdate
 * @property {(layout: object[], isFinal: boolean) => Promise<void>} handleHandoutImageLayout
 * @property {(sceneData: object|null) => Promise<void>} activateSceneAudio
 * @property {() => void} reopenPlayerCanvases
 * @property {(active: boolean) => Promise<void>} toggleCanvasState
 * @property {(image: object) => object[]} addHandoutImageOverlay
 */

/** Builds the action interface consumed by the Director UI. */
export class NarrativeDirectorActions {
  /** @param {NarrativeDirectorActionDependencies} dependencies */
  constructor(dependencies) {
    Object.assign(this, dependencies);
  }

  createCallbacks() {
    return {
      onJournalSelect: journalId => {
        const state = this.getState();
        if (state.journalViewerId === journalId) return;
        state.journalViewerId = journalId;
        if (state.activeSceneId) return;

        this.handleDisplayUpdate({
          journalViewerId: journalId,
          currentSceneData: null,
          activeActors: [],
          activeSpeakerId: null,
          activeTrackId: null
        });
      },
      onSceneSelect: async sceneId => {
        const state = this.getState();
        const scenes = NarrativeSceneRepository.getAll();
        const selectedData = sceneId ? scenes.find(scene => scene.id === sceneId) || null : null;
        if (sceneId && !selectedData) return;

        const newSceneActorIds = new Set((selectedData?.actors || []).map(actor => actor.id));
        const survivingActiveActors = selectedData
          ? (state.activeActors || []).filter(actor => newSceneActorIds.has(actor.id))
          : [];
        const survivingSpeakerId = selectedData && newSceneActorIds.has(state.activeSpeakerId)
          ? state.activeSpeakerId
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
        await this.activateSceneAudio(selectedData);
      },
      onActorStageToggle: actorId => {
        const state = this.getState();
        const actorData = state.currentSceneData?.actors.find(actor => actor.id === actorId);
        if (!actorData) return;

        const activeList = [...state.activeActors];
        let activeSpeakerId = state.activeSpeakerId;
        const existingIndex = activeList.findIndex(actor => actor.id === actorId);

        if (existingIndex > -1) {
          activeList.splice(existingIndex, 1);
          if (activeSpeakerId === actorId) activeSpeakerId = null;
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
      onActorStageRemove: actorId => {
        const state = this.getState();
        const activeList = state.activeActors.filter(actor => actor.id !== actorId);
        const activeSpeakerId = state.activeSpeakerId === actorId ? null : state.activeSpeakerId;
        this.handleDisplayUpdate({ activeActors: activeList, activeSpeakerId });
      },
      onActorSpeakerToggle: actorId => {
        const state = this.getState();
        let activeSpeakerId = state.activeSpeakerId;
        let activeList = [...state.activeActors];

        if (activeSpeakerId === actorId) {
          activeSpeakerId = null;
        } else {
          activeSpeakerId = actorId;
          if (!activeList.some(actor => actor.id === actorId)) {
            const actorData = state.currentSceneData?.actors.find(actor => actor.id === actorId);
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

        activeList = activeList.map(actor => ({
          ...actor,
          isSpeaker: actor.id === activeSpeakerId
        }));

        this.handleDisplayUpdate({ activeActors: activeList, activeSpeakerId });
      },
      onActorToggleName: async actorId => {
        const state = this.getState();
        const sceneId = state.activeSceneId;
        if (!sceneId) {
          const currentSceneData = state.currentSceneData;
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
            activeActors: state.activeActors.map(item => item.id === actorId ? { ...item, showName } : item)
          });
          return;
        }

        await NarrativeSceneRepository.toggleActorName(sceneId, actorId);
        const scenes = NarrativeSceneRepository.getAll();
        const updatedScene = scenes.find(scene => scene.id === sceneId) || null;
        const activeList = this.getState().activeActors.map(actor => {
          if (actor.id !== actorId) return actor;
          const sceneActor = updatedScene?.actors.find(item => item.id === actorId);
          return { ...actor, showName: sceneActor ? sceneActor.showName !== false : !actor.showName };
        });

        this.handleDisplayUpdate({
          scenesList: scenes,
          currentSceneData: updatedScene,
          activeActors: activeList
        });
      },
      onDialogueTrigger: dialogue => this.handleDisplayUpdate({ activeDialogue: dialogue }),
      onCloseAllHandouts: () => this.handleDisplayUpdate({ handoutImage: "", handoutImageOverlays: [] }),
      onBackgroundReset: () => this.handleDisplayUpdate({ background: "" }),
      onThemeSelect: themeId => this.handleDisplayUpdate({ themeOverrideId: themeId }),
      onJournalImageShow: journalImage => {
        this.handleDisplayUpdate({
          handoutImageOverlays: this.addHandoutImageOverlay({ ...journalImage, showDescription: true })
        });
      },
      onBackgroundChange: path => this.handleDisplayUpdate({ background: path }),
      onHandoutImageChange: path => {
        const image = this.getState().currentSceneData?.handoutImages?.find(item => item.path === path);
        if (!image) return;
        this.handleDisplayUpdate({
          handoutImage: path,
          handoutImageOverlays: this.addHandoutImageOverlay({
            src: image.path,
            title: image.name || "",
            description: image.description || "",
            showDescription: image.showDescription === true
          })
        });
      },
      onHandoutImageClose: overlayId => {
        const state = this.getState();
        const currentOverlays = state.handoutImageOverlays || [];
        const closingOverlay = currentOverlays.find(overlay => overlay.id === overlayId);
        const remainingOverlays = currentOverlays.filter(overlay => overlay.id !== overlayId);
        const selectedHandoutWasClosed = closingOverlay?.src === state.handoutImage;

        this.handleDisplayUpdate({
          handoutImage: selectedHandoutWasClosed
            ? remainingOverlays[remainingOverlays.length - 1]?.src || ""
            : state.handoutImage,
          handoutImageOverlays: remainingOverlays
        });
      },
      onHandoutImageLayoutChange: (layout, isFinal) =>
        this.handleHandoutImageLayout(layout, isFinal),
      onImageDescriptionToggle: async (collectionName, index) => {
        const sceneId = this.getState().activeSceneId;
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
      onTrackPlay: trackId => this.handleDisplayUpdate({ activeTrackId: trackId }),
      onVolumeChange: volume => this.handleDisplayUpdate({ globalVolume: volume }),
      onAudioMuteChange: audioMuted => this.handleDisplayUpdate({ audioMuted }),
      onVisibilityChange: visible => this.handleDisplayUpdate(visible
        ? { ...this.getState(), playerViewActive: true }
        : { playerViewActive: false }),
      onReopenPlayers: () => this.reopenPlayerCanvases(),
      onShutdown: () => this.toggleCanvasState(false)
    };
  }

  #refreshSceneHandoutOverlays(sceneData) {
    return (this.getState().handoutImageOverlays || []).map(overlay => {
      const image = sceneData?.handoutImages?.find(item => item.path === overlay.src);
      if (!image) return overlay;
      return {
        ...overlay,
        description: image.description || "",
        showDescription: image.showDescription === true
      };
    });
  }
}
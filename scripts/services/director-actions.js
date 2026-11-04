import { NarrativeSceneRepository } from "./scene-repository.js";
import { NarrativeSettings } from "./settings.js";
import { NarrativeLogger } from "./logger.js";

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
          this.#addToStage(activeList, {
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
      onActorStageClear: () => this.handleDisplayUpdate({ activeActors: [], activeSpeakerId: null }),
      onVisualNovelOverlayVisibilityToggle: () => this.handleDisplayUpdate({
        isVisualNovelOverlayVisible: !this.getState().isVisualNovelOverlayVisible
      }),
      onActorOrderChange: actorIds => {
        const activeActors = this.getState().activeActors || [];
        const actorsById = new Map(activeActors.map(actor => [actor.id, actor]));
        const orderedActors = actorIds.map(actorId => actorsById.get(actorId)).filter(Boolean);
        const orderedIds = new Set(orderedActors.map(actor => actor.id));
        this.handleDisplayUpdate({
          activeActors: [...orderedActors, ...activeActors.filter(actor => !orderedIds.has(actor.id))]
        });
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
              this.#addToStage(activeList, {
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
      onDialogueToggle: () => this.handleDisplayUpdate({
        dialogueSystemEnabled: !this.getState().dialogueSystemEnabled,
        dialogueLine: null
      }),
      onDialogueSend: ({ speakerId, text, voice, language, speedFactor }) =>
        this.#sendDialogueLine({ speakerId, text, voice, language, speedFactor }),
      onDialogueSpeedChange: multiplier => NarrativeSettings.setDialogueSpeedMultiplier(multiplier),
      onDialogueSpeedLive: multiplier => this.#applyLiveSpeed(multiplier),
      onDialogueVoiceChange: dialogueVoice => this.handleDisplayUpdate({ dialogueVoice: dialogueVoice === true }),
      onDialogueDismiss: () => {
        const line = this.getState().dialogueLine;
        if (line && !line.dismissed) this.handleDisplayUpdate({ dialogueLine: { ...line, dismissed: true } });
      },
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

  /** Adds an actor on the right when an odd number is staged, otherwise on the left. */
  #addToStage(activeList, actor) {
    if (activeList.length % 2 === 1) activeList.push(actor);
    else activeList.unshift(actor);
  }

  #speedLiveTimer = null;
  #speedLivePending = null;

  /** Passes a changed speed multiplier on to the line that is being shown, at most every 120 ms. */
  #applyLiveSpeed(multiplier) {
    this.#speedLivePending = multiplier;
    if (this.#speedLiveTimer !== null) return;

    const flush = () => {
      const value = this.#speedLivePending;
      this.#speedLivePending = null;
      const line = this.getState().dialogueLine;
      if (value !== null && line && !line.dismissed) {
        this.handleDisplayUpdate({ dialogueLine: { ...line, speedFactor: value } });
      }
    };
    flush();
    this.#speedLiveTimer = setTimeout(() => {
      this.#speedLiveTimer = null;
      flush();
    }, 120);
  }

  #sendDialogueLine({ speakerId, text, voice, language, speedFactor }) {
    const line = String(text ?? "").trim();
    if (!line) return;

    const actor = this.getState().currentSceneData?.actors?.find(item => item.id === speakerId);
    const isNarrator = !actor;
    const mayShowName = Boolean(actor) && actor.showName !== false;
    const languages = this.#getPolyglotLanguages();
    const defaultLanguage = languages?.[game.polyglot?.languageProvider?.defaultLanguage]
      ? game.polyglot.languageProvider.defaultLanguage
      : "";
    const requestedLanguage = isNarrator ? defaultLanguage : language;
    const activeLanguage = requestedLanguage && languages?.[requestedLanguage] ? requestedLanguage : "";

    // Speech only makes sense while the canvas is released to the players.
    const state = this.getState();
    if (voice && state.playerViewActive === true && game.modules.get("acd-talking-actors")?.active) {
      this.#talk(isNarrator ? "/narrate" : `/talk {${actor.id}}`, line, activeLanguage);
    }

    return this.handleDisplayUpdate({
      dialogueLine: {
        id: foundry.utils.randomID(),
        ts: Date.now(),
        isNarrator,
        speakerName: isNarrator ? "" : (mayShowName ? actor.name : NarrativeSettings.getUnknownSpeakerName()),
        text: line,
        speedFactor: speedFactor ?? NarrativeSettings.getDialogueSpeedMultiplier(),
        language: activeLanguage
      }
    });
  }

  #getPolyglotLanguages() {
    return game.modules.get("polyglot")?.active ? game.polyglot?.languageProvider?.languages ?? null : null;
  }

  /** Reads the line aloud via a Talking Actors chat command (`/talk {id}` or `/narrate`), tagging the chat message with the Polyglot language. */
  #talk(commandPrefix, text, language) {
    const postToChat = NarrativeSettings.shouldPostSpokenDialogueToChat();
    if (language && postToChat) {
      const userId = game.user.id;
      const timeout = setTimeout(() => Hooks.off("preCreateChatMessage", hookId), 5000);
      const hookId = Hooks.on("preCreateChatMessage", (message, data, options, senderId) => {
        if (senderId !== userId) return;
        message.updateSource({ "flags.polyglot.language": language });
        clearTimeout(timeout);
        Hooks.off("preCreateChatMessage", hookId);
      });
    }
    const command = `${commandPrefix} ${text.replace(/\s*\n\s*/g, " ")}`;
    NarrativeLogger.debug("Sending dialogue line to Talking Actors", { command, postToChat });
    const processor = game.acdTalkingActors?.chatProcessor;
    if (!postToChat && processor) {
      processor.processChatMessage(ui.chat, command, { speaker: ChatMessage.getSpeaker(), user: game.user.id }, false);
      return;
    }
    ui.chat?.processMessage?.(command)?.catch?.(error => NarrativeLogger.error("Talking Actors command failed", error));
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
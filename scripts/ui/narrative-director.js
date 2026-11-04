import { NarrativeCanvas } from "./narrative-canvas.js";
import { DirectorSidebar } from "./director-sidebar.js";
import { DirectorActorCarousel } from "./director-carousel.js";
import { DirectorImageControls } from "./director-image-controls.js";
import { DirectorCanvasToolbar } from "./director-canvas-toolbar.js";
import { PlaylistAudioMixer } from "../services/playlist-audio-mixer.js";
import { NarrativeLogger } from "../services/logger.js";

/**
 * Interactive master control interface layout for Gamemasters.
 */
export class NarrativeDirector extends NarrativeCanvas {
  /**
   * @param {object} callbacks - Flat interface containing logic execution targets
   */
  constructor(callbacks) {
    super("narrative-canvas-director", "director-view");
    this.callbacks = callbacks;
    this.imageControls = new DirectorImageControls();
    this.automaticPlaylist = null;
    this.automaticPlaylistSound = null;
    this.dialogueEnabled = false;
    this.audioMixer = new PlaylistAudioMixer({ globalVolume: 0.5 });
    this.toolbar = new DirectorCanvasToolbar({
      onVisibilityChange: (visible) => this.callbacks.onVisibilityChange(visible),
      onReopenPlayers: () => this.callbacks.onReopenPlayers?.(),
      onAudioMuteChange: (muted) => this.callbacks.onAudioMuteChange?.(muted),
      onCloseAllHandouts: () => this.callbacks.onCloseAllHandouts(),
      onBackgroundReset: () => this.callbacks.onBackgroundReset(),
      onThemeSelect: themeId => this.callbacks.onThemeSelect?.(themeId),
      onShutdown: () => this.callbacks.onShutdown(),
      onDialogueToggle: () => this.callbacks.onDialogueToggle?.(),
      onStopAllAudio: () => this.stopAllAudio()
    });
    this.sidebar = new DirectorSidebar({
      audioMixer: this.audioMixer,
      onSceneSelect: (sceneId) => {
        this.callbacks.onSceneSelect?.(sceneId);
      },
      onJournalSelect: (journalId) => this.callbacks.onJournalSelect?.(journalId),
      onJournalImageShow: (image) => this.callbacks.onJournalImageShow?.(image),
      onVolumeChange: (volume) => this.callbacks.onVolumeChange?.(volume),
      isDialogueEnabled: () => this.dialogueEnabled,
      onDialogueTextSelect: text => this.carousel.insertDialogueText(text)
    });
    this.carousel = new DirectorActorCarousel({
      onActorStageToggle: (actorId) => this.callbacks.onActorStageToggle?.(actorId),
      onActorStageRemove: (actorId) => this.callbacks.onActorStageRemove?.(actorId),
      onActorStageClear: () => this.callbacks.onActorStageClear?.(),
      onActorSpeakerToggle: (actorId) => this.callbacks.onActorSpeakerToggle?.(actorId),
      onActorToggleName: (actorId) => this.callbacks.onActorToggleName?.(actorId),
      onVisualNovelOverlayVisibilityToggle: () => this.callbacks.onVisualNovelOverlayVisibilityToggle?.(),
      onActorOrderChange: actorIds => this.callbacks.onActorOrderChange?.(actorIds),
      onDialogueSend: line => this.callbacks.onDialogueSend?.(line),
      onDialogueSpeedChange: speed => this.callbacks.onDialogueSpeedChange?.(speed),
      onDialogueVoiceChange: voice => this.callbacks.onDialogueVoiceChange?.(voice)
    });
    this._setupGlobalDelegatedListeners();
  }

  /** @override */
  async close() {
    this.globalClickAbortController?.abort();
    await this.stopAllAudio();
    await super.close();
    this.imageControls?.destroy();
    this.toolbar?.destroy();
    this.sidebar?.destroy();
    this.audioMixer?.destroy();
  }

  async activateSceneAudio(sceneData) {
    await this.stopAllAudio();
    this.audioMixer.setSceneTracks(sceneData?.tracks ?? []);

    const automaticTrack = sceneData?.tracks?.find(track => track.playAutomatically === true);
    if (!automaticTrack) {
      NarrativeLogger.debug("Scene has no automatic audio selection", { sceneId: sceneData?.id });
      return;
    }

    NarrativeLogger.info("Starting automatic scene audio", {
      sceneId: sceneData.id,
      trackId: automaticTrack.id,
      trackName: automaticTrack.name,
      playlistId: automaticTrack.sourcePlaylistId || null
    });

    if (automaticTrack.sourcePlaylistId) {
      const playlist = game.playlists?.get(automaticTrack.sourcePlaylistId)
        ?? game.collections?.get("Playlist")?.get(automaticTrack.sourcePlaylistId);
      if (!playlist) {
        NarrativeLogger.warn("Automatic scene playlist was not found", {
          sceneId: sceneData.id,
          playlistId: automaticTrack.sourcePlaylistId
        });
        return;
      }

      this.automaticPlaylist = playlist;
      if (automaticTrack.isPlaylistGroup === false) {
        const sound = playlist.sounds?.get(automaticTrack.id);
        if (!sound) {
          NarrativeLogger.warn("Automatic scene PlaylistSound was not found", {
            sceneId: sceneData.id,
            playlistId: playlist.id,
            trackId: automaticTrack.id
          });
          this.automaticPlaylist = null;
          return;
        }

        this.automaticPlaylistSound = sound;
        await playlist.playSound(sound);
      } else {
        this.automaticPlaylistSound = null;
        await playlist.playAll();
      }
      this.sidebar?.refreshAudioPlayback();
      return;
    }

    NarrativeLogger.warn("Cannot start automatic scene audio without a Foundry PlaylistSound reference", {
      sceneId: sceneData.id,
      trackId: automaticTrack.id,
      trackName: automaticTrack.name
    });
  }

  async setAudioMuted(muted) {
    this.audioMixer.muted = muted;
    this.sidebar?.refreshAudioPlayback();
  }

  async stopAllAudio() {
    await this.sidebar?.stopAllPlaylists();
    if (this.automaticPlaylistSound) {
      await this.automaticPlaylist?.stopSound(this.automaticPlaylistSound);
    } else {
      await this.automaticPlaylist?.stopAll();
    }
    this.automaticPlaylist = null;
    this.automaticPlaylistSound = null;
    this.sidebar?.refreshAudioPlayback();
  }

  /** @override */
  async _onPrepareElements(stageElement, context) {
    this.dialogueEnabled = context.dialogueSystemEnabled === true;
    this.audioMixer.setSceneTracks(context.currentSceneData?.tracks ?? []);
    await this.setAudioMuted(Boolean(context.audioMuted));
    const uiLayer = document.createElement("div");
    uiLayer.className = "narrative-director-ui-layer";

    const sidebarElement = await this.sidebar.render(context);
    const imageControlsContext = {
      ...context,
      ...this.sidebar.getAudioControlsContext()
    };
    const imageControlsElement = await this.imageControls.render(imageControlsContext);
    this.sidebar.attachAudioControls(imageControlsElement);
    uiLayer.appendChild(imageControlsElement);

    const toolbarElement = await this.toolbar.render(context);
    uiLayer.appendChild(toolbarElement);

    uiLayer.appendChild(sidebarElement);

    // 3. Bottom actor carousel (if actors exist in scene)
    const carouselElement = await this.carousel.render(context);
    if (carouselElement) {
      uiLayer.appendChild(carouselElement);
    }

    stageElement.appendChild(uiLayer);
  }

  /** @override */
  async _onUpdateElements(context) {
    this.dialogueEnabled = context.dialogueSystemEnabled === true;
    this.audioMixer.setSceneTracks(context.currentSceneData?.tracks ?? []);
    await this.setAudioMuted(Boolean(context.audioMuted));
    this.sidebar?.update(context);
    const imageControlsContext = {
      ...context,
      ...this.sidebar?.getAudioControlsContext()
    };
    const imageControlsElement = await this.imageControls?.updateInPlace(imageControlsContext);
    if (imageControlsElement) this.sidebar?.attachAudioControls(imageControlsElement);
    await this.toolbar?.updateInPlace(context, this.stageElement);
    const uiLayer = this.stageElement?.querySelector(".narrative-director-ui-layer");
    await this.carousel?.update(uiLayer ?? this.stageElement, context);
  }

  _onHandoutImageLayoutChange(layout) {
    this.callbacks.onHandoutImageLayoutChange?.(layout);
  }

  _onHandoutImageClose(overlayId) {
    this.callbacks.onHandoutImageClose?.(overlayId);
  }

  _onActorOrderChange(actorIds) {
    this.callbacks.onActorOrderChange?.(actorIds);
  }

  _onDialogueDismiss() {
    this.callbacks.onDialogueDismiss?.();
  }

  /**
   * Event Delegation Pattern to guarantee buttons stay responsive after asynchronous re-renders.
   * @private
   */
  _setupGlobalDelegatedListeners() {
    this.globalClickAbortController = new AbortController();
    document.addEventListener("click", (event) => {
      if (!this.stageElement) return;

      const target = event.target;

      const descriptionButton = target.closest(".btn-toggle-image-description");
      if (descriptionButton) {
        event.preventDefault();
        event.stopPropagation();
        this.callbacks.onImageDescriptionToggle?.(
          descriptionButton.dataset.imageCollection,
          Number(descriptionButton.dataset.imageIndex)
        );
        return;
      }

      const bgCard = target.closest(".bg-thumbnail-card");
      if (bgCard?.dataset.bgPath) {
        event.preventDefault();
        this.callbacks.onBackgroundChange?.(bgCard.dataset.bgPath);
        return;
      }

      const handoutCard = target.closest(".handout-thumbnail-card");
      if (handoutCard?.dataset.handoutImagePath) {
        event.preventDefault();
        this.callbacks.onHandoutImageChange?.(handoutCard.dataset.handoutImagePath);
        return;
      }

      if (target.closest(".btn-change-bg")) {
        event.preventDefault();
        new FilePicker({
          type: "image",
          classes: ["filepicker", "acd-nc-elevation"],
          callback: (path) => this.callbacks.onBackgroundChange(path)
        }).browse();
        return;
      }

      if (target.closest(".btn-trigger-dialog")) {
        event.preventDefault();
        
        const name = this.stageElement.querySelector(".speaker-name-input")?.value || "";
        const portrait = this.stageElement.querySelector(".speaker-portrait-input")?.value || "";
        const text = this.stageElement.querySelector(".dialogue-input")?.value || "";

        this.callbacks.onDialogueTrigger({
          speaker: name,
          portrait: portrait,
          text: text
        });
        return;
      }

    }, { capture: true, signal: this.globalClickAbortController.signal });
  }
}

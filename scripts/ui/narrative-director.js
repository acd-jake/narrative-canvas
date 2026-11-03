import { NarrativeCanvas } from "./narrative-canvas.js";
import { DirectorSidebar } from "./director-sidebar.js";
import { DirectorActorCarousel } from "./director-carousel.js";
import { DirectorImageControls } from "./director-image-controls.js";
import { DirectorCanvasToolbar } from "./director-canvas-toolbar.js";
import { SceneAudioController } from "../services/audio-controller.js";
import { TrackAudioPublisher } from "../services/track-audio-publisher.js";

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
    this.automaticPlaylistMuted = false;
    this.audioController = new SceneAudioController({
      globalVolume: 0.5,
      onStateChange: (trackId, state) => {
        this.sidebar?.updateAudioTrackItem(trackId);
        TrackAudioPublisher.publishStateChange(this.audioController, trackId, state);
      }
    });
    this.toolbar = new DirectorCanvasToolbar({
      onVisibilityChange: (visible) => this.callbacks.onVisibilityChange(visible),
      onReopenPlayers: () => this.callbacks.onReopenPlayers?.(),
      onAudioMuteChange: (muted) => this.callbacks.onAudioMuteChange?.(muted),
      onCloseAllHandouts: () => this.callbacks.onCloseAllHandouts(),
      onBackgroundReset: () => this.callbacks.onBackgroundReset(),
      onShutdown: () => this.callbacks.onShutdown(),
      onStopAllAudio: () => this.stopAllAudio()
    });
    this.sidebar = new DirectorSidebar({
      audioController: this.audioController,
      onSceneSelect: (sceneId) => {
        this.callbacks.onSceneSelect?.(sceneId);
      },
      onJournalSelect: (journalId) => this.callbacks.onJournalSelect?.(journalId),
      onJournalImageShow: (image) => this.callbacks.onJournalImageShow?.(image),
      onVolumeChange: (volume) => this.callbacks.onVolumeChange?.(volume)
    });
    this.carousel = new DirectorActorCarousel({
      onActorStageToggle: (actorId) => this.callbacks.onActorStageToggle?.(actorId),
      onActorStageRemove: (actorId) => this.callbacks.onActorStageRemove?.(actorId),
      onActorSpeakerToggle: (actorId) => this.callbacks.onActorSpeakerToggle?.(actorId),
      onActorToggleName: (actorId) => this.callbacks.onActorToggleName?.(actorId)
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
    this.sidebar?.destroy();
  }

  async activateSceneAudio(sceneData) {
    await this.stopAllAudio();

    const automaticTrack = sceneData?.tracks?.find(track => track.playAutomatically === true);
    if (!automaticTrack) return;

    if (automaticTrack.sourcePlaylistId) {
      const playlist = game.playlists?.get(automaticTrack.sourcePlaylistId)
        ?? game.collections?.get("Playlist")?.get(automaticTrack.sourcePlaylistId);
      if (!playlist) return;

      this.automaticPlaylist = playlist;
      if (this.audioController.muted) {
        this.automaticPlaylistMuted = true;
        return;
      }

      await playlist.playAll();
      this.sidebar?.refreshAudioPlayback();
      return;
    }

    await this.audioController.play(automaticTrack);
  }

  async setAudioMuted(muted) {
    this.audioController.muted = muted;
    if (!this.automaticPlaylist) return;

    if (muted && !this.automaticPlaylistMuted) {
      await this.automaticPlaylist.stopAll();
      this.automaticPlaylistMuted = true;
    } else if (!muted && this.automaticPlaylistMuted) {
      await this.automaticPlaylist.playAll();
      this.automaticPlaylistMuted = false;
    }
    this.sidebar?.refreshAudioPlayback();
  }

  async stopAllAudio() {
    await this.audioController?.stopAll();
    await this.sidebar?.stopAllPlaylists();
    await this.automaticPlaylist?.stopAll();
    this.automaticPlaylist = null;
    this.automaticPlaylistMuted = false;
    this.sidebar?.refreshAudioPlayback();
  }

  /** @override */
  async _onPrepareElements(stageElement, context) {
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

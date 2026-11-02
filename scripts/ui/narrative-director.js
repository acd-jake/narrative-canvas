import { NarrativeCanvas } from "./narrative-canvas.js";
import { DirectorSidebar } from "./director-sidebar.js";
import { DirectorActorCarousel } from "./director-carousel.js";
import { DirectorImageControls } from "./director-image-controls.js";
import { DirectorCanvasToolbar } from "./director-canvas-toolbar.js";
import { SceneAudioController } from "../services/audio-controller.js";

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
    this.audioController = new SceneAudioController({
      globalVolume: 0.5,
      onStateChange: (trackId) => this.sidebar?.updateAudioTrackItem(trackId)
    });
    this.toolbar = new DirectorCanvasToolbar({
      onVisibilityChange: (visible) => this.callbacks.onVisibilityChange(visible),
      onReopenPlayers: () => this.callbacks.onReopenPlayers?.(),
      onCloseAllHandouts: () => this.callbacks.onCloseAllHandouts(),
      onBackgroundReset: () => this.callbacks.onBackgroundReset(),
      onShutdown: () => this.callbacks.onShutdown(),
      onStopAllAudio: () => this.audioController.stopAll()
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
    this.audioController?.stopAll();
    await super.close();
    this.imageControls?.destroy();
    this.toolbar?.destroy();
  }

  /** @override */
  async _onPrepareElements(stageElement, context) {
    const uiLayer = document.createElement("div");
    uiLayer.className = "narrative-director-ui-layer";

    // 1. Right-side image controls
    const imageControlsElement = await this.imageControls.render(context);
    uiLayer.appendChild(imageControlsElement);

    const toolbarElement = await this.toolbar.render(context);
    uiLayer.appendChild(toolbarElement);

    // 2. Left-side scenes & journal sidebar
    const sidebarElement = await this.sidebar.render(context);
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
    await this.imageControls?.updateInPlace(context);
    await this.toolbar?.updateInPlace(context, this.stageElement);
    this.sidebar?.update(context);
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

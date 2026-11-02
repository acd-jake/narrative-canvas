import { NarrativeCanvas } from "./narrative-canvas.js";
import { DirectorSidebar } from "./director-sidebar.js";
import { DirectorActorCarousel } from "./director-carousel.js";
import { DirectorControls } from "./director-controls.js";
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
    this.controls = new DirectorControls();
    this.audioController = new SceneAudioController({
      globalVolume: 0.5,
      onStateChange: (trackId) => this.sidebar?.updateAudioTrackItem(trackId)
    });
    this.toolbar = new DirectorCanvasToolbar({
      onVisibilityChange: (visible) => this.callbacks.onVisibilityChange(visible),
      onClearDisplay: () => this.callbacks.onClearDisplay(),
      onShutdown: () => this.callbacks.onShutdown(),
      onStopAllAudio: () => this.audioController.stopAll()
    });
    this.sidebar = new DirectorSidebar({
      audioController: this.audioController,
      onSceneSelect: (sceneId) => {
        this.callbacks.onSceneSelect?.(sceneId);
      },
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
    this.audioController?.stopAll();
    await super.close();
    this.controls?.destroy();
    this.toolbar?.destroy();
  }

  /** @override */
  async _onPrepareElements(stageElement, context) {
    // 1. Right-side control panel
    const controlsElement = await this.controls.render(context);
    stageElement.appendChild(controlsElement);

    const toolbarElement = await this.toolbar.render(context);
    stageElement.appendChild(toolbarElement);

    // 2. Left-side scenes & journal sidebar
    const sidebarElement = await this.sidebar.render(context);
    stageElement.appendChild(sidebarElement);

    // 3. Bottom actor carousel (if actors exist in scene)
    const carouselElement = await this.carousel.render(context);
    if (carouselElement) {
      stageElement.appendChild(carouselElement);
    }
  }

  /** @override */
  async _onUpdateElements(context) {
    await this.controls?.updateInPlace(context);
    await this.toolbar?.updateInPlace(context);
    this.sidebar?.update(context);
    await this.carousel?.update(this.stageElement, context);
  }

  _onHandoutImageLayoutChange(layout) {
    this.callbacks.onHandoutImageLayoutChange?.(layout);
  }

  /**
   * Event Delegation Pattern to guarantee buttons stay responsive after asynchronous re-renders.
   * @private
   */
  _setupGlobalDelegatedListeners() {
    document.body.addEventListener("click", (event) => {
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

      if (target.closest(".btn-toggle-sidebar")) {
        event.preventDefault();
        this.sidebar?.toggleCollapse();
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

      if (target.closest(".btn-close-handout-image")) {
        event.preventDefault();
        this.callbacks.onHandoutImageClose?.(target.closest(".btn-close-handout-image").dataset.overlayId);
        return;
      }

    });
  }
}

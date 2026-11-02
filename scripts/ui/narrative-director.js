import { NarrativeCanvas } from "./narrative-canvas.js";
import { DirectorSidebar } from "./director-sidebar.js";
import { DirectorActorCarousel } from "./director-carousel.js";
import { DirectorControls } from "./director-controls.js";
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
    this.sidebar = new DirectorSidebar({
      audioController: this.audioController,
      onSceneSelect: (sceneId) => {
        this.audioController.stopAll();
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
  }

  /** @override */
  async _onPrepareElements(stageElement, context) {
    // 1. Right-side control panel
    const controlsElement = await this.controls.render(context);
    stageElement.appendChild(controlsElement);

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
    this.sidebar?.update(context);
    await this.carousel?.update(this.stageElement, context);
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

      if (target.closest(".btn-publish-players")) {
        event.preventDefault();
        this.callbacks.onVisibilityChange(true);
        return;
      }

      if (target.closest(".btn-hide-players")) {
        event.preventDefault();
        this.callbacks.onVisibilityChange(false);
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

      if (target.closest(".btn-clear-display")) {
        event.preventDefault();
        this.callbacks.onClearDisplay();
        return;
      }

      if (target.closest(".btn-close-handout-image")) {
        event.preventDefault();
        this.callbacks.onHandoutImageClose?.(target.closest(".btn-close-handout-image").dataset.overlayId);
        return;
      }

      if (target.closest(".btn-shutdown-canvas")) {
        event.preventDefault();
        this.callbacks.onShutdown();
        return;
      }
    });
  }
}

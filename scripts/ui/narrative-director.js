import { NarrativeCanvas } from "./narrative-canvas.js";
import { DirectorSidebar } from "./director-sidebar.js";

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
    this.sidebar = new DirectorSidebar({
      onSceneSelect: (sceneId) => this.callbacks.onSceneSelect?.(sceneId)
    });
    this._setupGlobalDelegatedListeners();
  }

  /** @override */
  async _onPrepareElements(stageElement, context) {
    // 1. Right-side control panel
    const controlsHtml = await renderTemplate("modules/narrative-canvas/templates/partials/director-controls.hbs", context);
    const parser = new DOMParser();
    const doc = parser.parseFromString(controlsHtml, "text/html");
    const panelElement = doc.body.firstElementChild;
    stageElement.appendChild(panelElement);

    // 2. Left-side scenes & journal sidebar
    const sidebarElement = await this.sidebar.render(context);
    stageElement.appendChild(sidebarElement);
  }

  /**
   * Event Delegation Pattern to guarantee buttons stay responsive after asynchronous re-renders.
   * @private
   */
  _setupGlobalDelegatedListeners() {
    document.body.addEventListener("change", (event) => {
      if (!this.stageElement) return;

      const sceneSelect = event.target.closest(".selector-narrative-scene");
      if (sceneSelect) {
        event.preventDefault();
        this.callbacks.onSceneSelect?.(sceneSelect.value);
      }
    });

    document.body.addEventListener("click", (event) => {
      if (!this.stageElement) return;

      const target = event.target;

      const bgCard = target.closest(".bg-thumbnail-card");
      if (bgCard?.dataset.bgPath) {
        event.preventDefault();
        this.callbacks.onBackgroundChange?.(bgCard.dataset.bgPath);
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

      if (target.closest(".btn-shutdown-canvas")) {
        event.preventDefault();
        this.callbacks.onShutdown();
        return;
      }
    });
  }
}

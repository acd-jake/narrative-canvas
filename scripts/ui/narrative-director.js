import { NarrativeCanvas } from "./narrative-canvas.js";

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
    this._setupGlobalDelegatedListeners();
  }

  /** @override */
  async _onPrepareElements(stageElement, context) {
    const controlsHtml = await renderTemplate("modules/narrative-canvas/templates/partials/director-controls.hbs", context);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(controlsHtml, "text/html");
    const panelElement = doc.body.firstElementChild;
    
    stageElement.appendChild(panelElement);
  }

  /**
   * Event Delegation Pattern to guarantee buttons stay responsive after asynchronous re-renders.
   * @private
   */
  _setupGlobalDelegatedListeners() {
    document.body.addEventListener("click", (event) => {
      if (!this.stageElement) return;

      const target = event.target;

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
        const textInput = this.stageElement.querySelector(".dialogue-input")?.value || "";
        this.callbacks.onDialogueTrigger(textInput);
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

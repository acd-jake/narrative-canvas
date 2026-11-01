import { NarrativeSettings } from "../services/settings.js";

/**
 * Abstract base class for raw DOM injection overlays, completely detached 
 * from Foundry's window-based Application framework.
 * @abstract
 */
export class NarrativeCanvas {
  /**
   * @param {string} id - The unique element ID to apply to the root node
   * @param {string} viewClass - Extra class to distinguish player and director views
   */
  constructor(id, viewClass) {
    if (this.constructor === NarrativeCanvas) {
      throw new TypeError("Abstract class 'NarrativeCanvas' cannot be instantiated directly.");
    }
    this.id = id;
    this.viewClass = viewClass;
    this.stageElement = null;
    this._resizeHandler = null;
  }

  /**
   * Compiles the Handlebars template and inserts it directly into the DOM body root.
   * @param {object} state - The full current narrative context module state
   */
  async render(state) {
    // Soft clean without triggering a hard close to keep global listeners alive
    const existingNode = document.getElementById(this.id);
    if (existingNode) existingNode.remove();

    const context = {
      ...state,
      isGM: game.user.isGM,
      customBgColor: NarrativeSettings.getBackgroundColor()
    };

    const htmlString = await renderTemplate("modules/narrative-canvas/templates/main-display.hbs", context);

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newStage = doc.body.firstElementChild;

    newStage.id = this.id;
    newStage.classList.add("acd-nc", this.viewClass);
    newStage.style.setProperty("--nc-custom-bg", context.customBgColor || "#000000");

    if (context.background) {
      newStage.style.backgroundImage = `url('${context.background}')`;
    }

    await this._onPrepareElements(newStage, context);

    document.body.appendChild(newStage);
    this.stageElement = newStage;
    document.body.classList.add("acd-nc-active");

    // Re-verify resize handler attachment
    if (!this._resizeHandler) {
      this._resizeHandler = this._handleWindowResize.bind(this);
      window.addEventListener("resize", this._resizeHandler);
    }
  }

  /**
   * Abstract hook for subclasses to safely append interior template nodes.
   * @protected
   */
  async _onPrepareElements(stageElement, context) {}

  /**
   * Completely tears down the element tree from the document body root.
   */
  close() {
    document.body.classList.remove("acd-nc-active");

    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }

    const node = document.getElementById(this.id);
    if (node) node.remove();

    this.stageElement = null;
  }

  /**
   * Ensures the raw container expands reactively across browser adjustments.
   * @private
   */
  _handleWindowResize() {
    if (!this.stageElement) return;
    this.stageElement.style.width = `${window.innerWidth}px`;
    this.stageElement.style.height = `${window.innerHeight}px`;
  }
}

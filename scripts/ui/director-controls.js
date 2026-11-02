import { NarrativeSettings } from "../services/settings.js";

/**
 * Controller for the GM Director panel (right-side control panel).
 * Manages background and handout image selection for the active scene.
 */
export class DirectorControls {
  /** @type {HTMLElement|null} */
  #element = null;

  /**
   * Renders the director control panel and returns the element.
   * @param {object} context - Module state and view context
   * @returns {Promise<HTMLElement>}
   */
  async render(context = {}) {
    const templateContext = this.#createTemplateContext(context);
    const htmlString = await renderTemplate(
      "modules/narrative-canvas/templates/partials/director-controls.hbs",
      templateContext
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;
    this.#element = newElement;
    this.#bindTileSizeSlider(this.#element);
    return newElement;
  }

  /**
   * Updates the director panel in-place without rebuilding the parent canvas overlay.
  * Updates background and handout image selection for the active scene.
   * @param {object} context - Updated module state and view context
   */
  async updateInPlace(context = {}) {
    if (!this.#element) return;

    const templateContext = this.#createTemplateContext(context);
    const htmlString = await renderTemplate(
      "modules/narrative-canvas/templates/partials/director-controls.hbs",
      templateContext
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;

    if (newElement) {
      this.#element.innerHTML = newElement.innerHTML;
      this.#element.style.setProperty("--nc-director-tile-size", `${templateContext.tileSize}px`);
    }
  }

  #createTemplateContext(context) {
    return { ...context, tileSize: NarrativeSettings.getTileSize() };
  }

  #bindTileSizeSlider(root) {
    root.addEventListener("input", event => {
      const slider = event.target.closest(".slider-tile-scale");
      if (!slider) return;

      const size = Number(slider.value);
      this.#element.style.setProperty("--nc-director-tile-size", `${size}px`);
      void NarrativeSettings.setTileSize(size);
    });
  }

  /**
   * Destroys the panel controller and cleans up references.
   */
  destroy() {
    if (this.#element) {
      this.#element.remove();
      this.#element = null;
    }
  }
}

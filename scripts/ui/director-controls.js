/**
 * Controller for the GM Director panel (right-side control panel).
 * Manages the scene dropdown, sidebar toggle, and background quick-selection grid.
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
    const htmlString = await renderTemplate(
      "modules/narrative-canvas/templates/partials/director-controls.hbs",
      context
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;
    this.#element = newElement;
    return newElement;
  }

  /**
   * Updates the director panel in-place without rebuilding the parent canvas overlay.
   * Updates scene selection dropdown, background quick-selection grid, and status indicators.
   * @param {object} context - Updated module state and view context
   */
  async updateInPlace(context = {}) {
    if (!this.#element) return;

    const htmlString = await renderTemplate(
      "modules/narrative-canvas/templates/partials/director-controls.hbs",
      context
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;

    if (newElement) {
      this.#element.innerHTML = newElement.innerHTML;
    }
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

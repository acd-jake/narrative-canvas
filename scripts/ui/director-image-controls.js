import { NarrativeSettings } from "../services/settings.js";

/**
 * Controls background and handout image selection for the active scene.
 */
export class DirectorImageControls {
  /** @type {HTMLElement|null} */
  #element = null;
  #isCollapsed = false;

  /**
   * Renders the image controls panel.
   * @param {object} context
   * @returns {Promise<HTMLElement>}
   */
  async render(context = {}) {
    const templateContext = this.#createTemplateContext(context);
    const htmlString = await renderTemplate(
      "modules/narrative-canvas/templates/partials/director-image-controls.hbs",
      templateContext
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;
    this.#element = newElement;
    this.#bindListeners(this.#element);
    return newElement;
  }

  /**
   * Updates image controls without rebuilding the parent canvas overlay.
   * @param {object} context
   */
  async updateInPlace(context = {}) {
    if (!this.#element) return;

    const templateContext = this.#createTemplateContext(context);
    const htmlString = await renderTemplate(
      "modules/narrative-canvas/templates/partials/director-image-controls.hbs",
      templateContext
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;

    if (newElement) {
      this.#element.innerHTML = newElement.innerHTML;
      this.#element.classList.toggle("is-collapsed", this.#isCollapsed);
      this.#element.style.setProperty("--nc-director-image-tile-size", `${templateContext.tileSize}px`);
    }
  }

  #createTemplateContext(context) {
    return {
      ...context,
      tileSize: NarrativeSettings.getTileSize(),
      isCollapsed: this.#isCollapsed
    };
  }

  #bindListeners(root) {
    root.addEventListener("input", event => {
      if (!(event.target instanceof Element)) return;
      const slider = event.target.closest(".slider-tile-scale");
      if (!slider) return;

      const size = Number(slider.value);
      this.#element.style.setProperty("--nc-director-image-tile-size", `${size}px`);
      void NarrativeSettings.setTileSize(size);
    });

    root.addEventListener("click", event => {
      if (!(event.target instanceof Element)) return;
      const toggle = event.target.closest(".btn-toggle-image-controls");
      if (!toggle) return;

      event.preventDefault();
      this.#isCollapsed = !this.#isCollapsed;
      this.#element.classList.toggle("is-collapsed", this.#isCollapsed);

      const content = this.#element.querySelector("#director-image-controls-content");
      if (content) content.hidden = this.#isCollapsed;

      toggle.setAttribute("aria-expanded", String(!this.#isCollapsed));
      toggle.title = game.i18n.localize(this.#isCollapsed
        ? "NARRATIVE_CANVAS.Director.ExpandImageControls"
        : "NARRATIVE_CANVAS.Director.CollapseImageControls");
      toggle.setAttribute("aria-label", toggle.title);
      const icon = toggle.querySelector("i");
      if (icon) icon.className = `fas ${this.#isCollapsed ? "fa-chevron-down" : "fa-chevron-up"}`;
    });
  }

  /**
   * Destroys the panel and releases its DOM reference.
   */
  destroy() {
    if (this.#element) {
      this.#element.remove();
      this.#element = null;
    }
  }
}
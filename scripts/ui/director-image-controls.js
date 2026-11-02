import { NarrativeSettings } from "../services/settings.js";

/**
 * Controls background and handout image selection for the active scene.
 */
export class DirectorImageControls {
  /** @type {HTMLElement|null} */
  #element = null;
  #isPanelCollapsed = false;
  #collapsedLists = new Set();
  #resizeObserver = null;
  #layoutFrame = null;

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
    this.#resizeObserver = new ResizeObserver(() => this.#scheduleListLayout());
    this.#resizeObserver.observe(this.#element);
    this.#scheduleListLayout();
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
      this.#element.classList.toggle("is-collapsed", this.#isPanelCollapsed);
      this.#element.style.setProperty("--nc-director-image-tile-size", `${templateContext.tileSize}px`);
      this.#scheduleListLayout();
    }
  }

  #createTemplateContext(context) {
    return {
      ...context,
      tileSize: NarrativeSettings.getTileSize(),
      isPanelCollapsed: this.#isPanelCollapsed,
      isBackgroundsCollapsed: this.#collapsedLists.has("backgrounds"),
      isHandoutsCollapsed: this.#collapsedLists.has("handouts")
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
      this.#scheduleListLayout();
    });

    root.addEventListener("click", event => {
      if (!(event.target instanceof Element)) return;
      const panelToggle = event.target.closest(".btn-toggle-image-controls-panel");
      if (panelToggle) {
        event.preventDefault();
        this.#isPanelCollapsed = !this.#isPanelCollapsed;
        this.#element.classList.toggle("is-collapsed", this.#isPanelCollapsed);
        panelToggle.setAttribute("aria-expanded", String(!this.#isPanelCollapsed));
        panelToggle.title = game.i18n.localize(this.#isPanelCollapsed
          ? "NARRATIVE_CANVAS.Director.ExpandImageControls"
          : "NARRATIVE_CANVAS.Director.CollapseImageControls");
        panelToggle.setAttribute("aria-label", panelToggle.title);
        const icon = panelToggle.querySelector("i");
        if (icon) icon.className = `fas ${this.#isPanelCollapsed ? "fa-chevron-left" : "fa-chevron-right"}`;
        return;
      }

      const listToggle = event.target.closest(".btn-toggle-image-list");
      if (!listToggle) return;

      event.preventDefault();
      const listId = listToggle.dataset.imageList;
      if (!listId) return;

      const isCollapsed = !this.#collapsedLists.has(listId);
      if (isCollapsed) this.#collapsedLists.add(listId);
      else this.#collapsedLists.delete(listId);

      const list = this.#element.querySelector(`#${listToggle.getAttribute("aria-controls")}`);
      if (list) list.hidden = isCollapsed;
      listToggle.setAttribute("aria-expanded", String(!isCollapsed));
      listToggle.title = game.i18n.localize(isCollapsed
        ? "NARRATIVE_CANVAS.Director.ExpandImageList"
        : "NARRATIVE_CANVAS.Director.CollapseImageList");
      listToggle.setAttribute("aria-label", listToggle.title);
      const icon = listToggle.querySelector("i");
      if (icon) icon.className = `fas ${isCollapsed ? "fa-chevron-right" : "fa-chevron-down"}`;
      this.#scheduleListLayout();
    });
  }

  #scheduleListLayout() {
    if (this.#layoutFrame !== null) cancelAnimationFrame(this.#layoutFrame);
    this.#layoutFrame = requestAnimationFrame(() => {
      this.#layoutFrame = null;
      this.#updateListHeights();
    });
  }

  #updateListHeights() {
    if (!this.#element?.isConnected) return;

    const content = this.#element.querySelector(".director-image-controls-content");
    const scaleController = this.#element.querySelector(".director-image-scale-controller");
    const groups = [...this.#element.querySelectorAll(".director-image-control-group")];
    const visibleLists = groups
      .map(group => group.querySelector(".director-image-list"))
      .filter(list => list && !list.hidden);
    if (!content || !scaleController || visibleLists.length === 0) return;

    const scaleMargin = Number.parseFloat(getComputedStyle(scaleController).marginBottom) || 0;
    const groupSpace = groups.reduce((total, group) => {
      const header = group.querySelector(".director-image-list-header");
      const headerMargin = header ? Number.parseFloat(getComputedStyle(header).marginBottom) || 0 : 0;
      const margin = Number.parseFloat(getComputedStyle(group).marginBottom) || 0;
      return total + (header?.getBoundingClientRect().height ?? 0) + headerMargin + margin;
    }, 0);
    const availableHeight = Math.max(0,
      content.clientHeight - scaleController.getBoundingClientRect().height - scaleMargin - groupSpace
    );
    const requiredHeights = visibleLists.map(list => list.scrollHeight);
    const halfHeight = availableHeight / 2;
    let targetHeights;

    if (requiredHeights.length === 1) {
      targetHeights = [Math.min(requiredHeights[0], availableHeight)];
    } else if (requiredHeights[0] > halfHeight && requiredHeights[1] > halfHeight) {
      targetHeights = [halfHeight, halfHeight];
    } else if (requiredHeights[0] <= halfHeight) {
      targetHeights = [requiredHeights[0], Math.min(requiredHeights[1], availableHeight - requiredHeights[0])];
    } else {
      targetHeights = [Math.min(requiredHeights[0], availableHeight - requiredHeights[1]), requiredHeights[1]];
    }

    visibleLists.forEach((list, index) => {
      list.style.maxHeight = `${targetHeights[index]}px`;
    });
  }

  /**
   * Destroys the panel and releases its DOM reference.
   */
  destroy() {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    if (this.#layoutFrame !== null) cancelAnimationFrame(this.#layoutFrame);
    this.#layoutFrame = null;
    if (this.#element) {
      this.#element.remove();
      this.#element = null;
    }
  }
}
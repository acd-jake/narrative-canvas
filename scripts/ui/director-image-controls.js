import { NarrativeSettings } from "../services/settings.js";
import { ResizableSectionController } from "./resizable-section-controller.js";
import { ResizablePanelController } from "./resizable-panel-controller.js";

/**
 * Controls background and handout image selection for the active scene.
 */
export class DirectorImageControls {
  /** @type {HTMLElement|null} */
  #element = null;
  #isPanelCollapsed = false;
  #panelWidth = null;
  #panelOverflowOffset = 0;
  #panelResizeController = null;
  #collapsedLists = new Set();
  #manualListHeights = new Map();
  #resizableSections = [];
  #resizeObserver = null;
  #layoutFrame = null;

  /**
   * Renders the image controls panel.
   * @param {object} context
   * @returns {Promise<HTMLElement>}
   */
  async render(context = {}) {
    this.#destroyResizableSections();
    this.#destroyPanelResizeController();
    this.#resizeObserver?.disconnect();
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
      this.#destroyResizableSections();
      this.#destroyPanelResizeController();
      this.#element.innerHTML = newElement.innerHTML;
      this.#element.classList.toggle("is-collapsed", this.#isPanelCollapsed);
      this.#element.style.setProperty("--nc-director-image-tile-size", `${templateContext.tileSize}px`);
      this.#bindPanelResize(this.#element);
      this.#bindResizableSections(this.#element);
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

    this.#bindResizableSections(root);
    this.#bindPanelResize(root);
  }

  #bindPanelResize(root) {
    const handle = root.querySelector(".btn-resize-director-panel");
    if (!handle) return;

    this.#panelResizeController?.destroy();
    this.#panelResizeController = new ResizablePanelController({
      panel: root,
      handle,
      edge: "left",
      minWidth: 50,
      minContentWidth: 150,
      maxWidth: 560,
      getMaxWidth: () => Math.min(560, window.innerWidth * 0.45),
      initialWidth: this.#panelWidth,
      initialOverflowOffset: this.#panelOverflowOffset,
      isCollapsed: () => root.classList.contains("is-collapsed"),
      onResize: width => {
        this.#panelWidth = width;
      },
      onOverflow: offset => {
        this.#panelOverflowOffset = offset;
        root.style.setProperty("--nc-panel-overflow-offset", `${offset}px`);
      },
      onToggle: () => {
        this.#togglePanelCollapse();
        if (!this.#isPanelCollapsed) {
          this.#panelOverflowOffset = 0;
          root.style.removeProperty("--nc-panel-overflow-offset");
        }
      }
    });
  }

  #togglePanelCollapse() {
    this.#isPanelCollapsed = !this.#isPanelCollapsed;
    this.#element?.classList.toggle("is-collapsed", this.#isPanelCollapsed);
    const handle = this.#element?.querySelector(".btn-resize-director-panel");
    if (!handle) return;

    const title = game.i18n.localize(this.#isPanelCollapsed
      ? "NARRATIVE_CANVAS.Director.ExpandImageControls"
      : "NARRATIVE_CANVAS.Director.ResizePanelWidth");
    handle.title = title;
    handle.setAttribute("aria-label", title);
    handle.setAttribute("aria-expanded", String(!this.#isPanelCollapsed));
    const icon = handle.querySelector("i");
    if (icon) icon.className = `fas ${this.#isPanelCollapsed ? "fa-chevron-left" : "fa-grip-lines-vertical"}`;
  }

  #destroyPanelResizeController() {
    this.#panelResizeController?.destroy();
    this.#panelResizeController = null;
  }

  #bindResizableSections(root) {
    root.querySelectorAll(".director-image-control-group").forEach(section => {
      const header = section.querySelector(".director-image-list-header");
      const content = section.querySelector(".director-image-list");
      const toggleButton = header?.querySelector(".btn-toggle-image-list");
      const listId = toggleButton?.dataset.imageList;
      if (!header || !content || !toggleButton || !listId) return;

      const headerHeight = header.getBoundingClientRect().height;
      const marginBottom = Number.parseFloat(getComputedStyle(header).marginBottom) || 0;
      const listHeight = this.#manualListHeights.get(listId);
      const expandedHeight = listHeight === undefined
        ? null
        : headerHeight + marginBottom + listHeight;
      const controller = new ResizableSectionController({
        section,
        header,
        content,
        toggleButton,
        isCollapsed: this.#collapsedLists.has(listId),
        isResizable: listId !== "backgrounds",
        expandedHeight,
        minHeight: 100,
        getMaxHeight: () => Math.max(
          header.getBoundingClientRect().height,
          this.#element?.querySelector(".director-image-controls-content")?.clientHeight ?? window.innerHeight
        ),
        createResizeHandler: resizeContext => this.#createImageListResizeHandler(section, resizeContext),
        onBeforeToggle: () => this.#captureImageListHeights(root),
        onToggle: toggleState => this.#resizeAdjacentImageList(section, toggleState),
        applyHeight: ({ isCollapsed, expandedHeight: sectionHeight }) => {
          content.hidden = isCollapsed;
          if (isCollapsed || sectionHeight === null) return;
          this.#manualListHeights.set(
            listId,
            this.#getListHeight(section, sectionHeight)
          );
          const height = `${this.#manualListHeights.get(listId)}px`;
          content.style.height = height;
          content.style.maxHeight = height;
        },
        onChange: ({ isCollapsed, expandedHeight: sectionHeight }) => {
          if (isCollapsed) this.#collapsedLists.add(listId);
          else this.#collapsedLists.delete(listId);
          if (sectionHeight !== null) {
            this.#manualListHeights.set(listId, this.#getListHeight(section, sectionHeight));
          }
          this.#scheduleListLayout();
        },
        expandLabel: "NARRATIVE_CANVAS.Director.ExpandImageList",
        collapseLabel: "NARRATIVE_CANVAS.Director.CollapseImageList"
      });
      this.#resizableSections.push(controller);
    });
  }

  #captureImageListHeights(root) {
    return [...root.querySelectorAll(".director-image-control-group")].map(section => {
      const list = section.querySelector(".director-image-list");
      const listId = section.querySelector(".btn-toggle-image-list")?.dataset.imageList;
      const isCollapsed = list?.hidden ?? true;
      return {
        section,
        list,
        listId,
        height: section.getBoundingClientRect().height,
        listHeight: isCollapsed
          ? this.#manualListHeights.get(listId) ?? 0
          : list.getBoundingClientRect().height,
        isCollapsed
      };
    });
  }

  #resizeAdjacentImageList(section, { isCollapsed, previousHeight, currentHeight, snapshot }) {
    if (!snapshot) return;

    const heightChange = currentHeight - previousHeight;
    const adjacentSection = section.nextElementSibling ?? section.previousElementSibling;
    const adjacentState = snapshot.find(item => item.section === adjacentSection);

    snapshot.forEach(item => {
      if (item.section === section) {
        const listHeight = isCollapsed
          ? item.listHeight
          : item.list.getBoundingClientRect().height;
        this.#manualListHeights.set(item.listId, listHeight);
        return;
      }

      if (!item.isCollapsed && item.list) {
        const isAdjacent = item === adjacentState;
        const nextHeight = isAdjacent
          ? Math.max(0, item.listHeight - heightChange)
          : item.listHeight;
        item.list.style.height = `${nextHeight}px`;
        item.list.style.maxHeight = `${nextHeight}px`;
        this.#manualListHeights.set(item.listId, nextHeight);
      }
    });

    this.#scheduleListLayout();
  }

  #createImageListResizeHandler(section, { startHeight, wasCollapsed }) {
    const previousSection = section.previousElementSibling;
    const previousList = previousSection?.querySelector(".director-image-list");
    const currentList = section.querySelector(".director-image-list");
    const previousToggle = previousSection?.querySelector(".btn-toggle-image-list");
    const currentToggle = section.querySelector(".btn-toggle-image-list");
    if (!previousList || !currentList || !previousToggle || !currentToggle) return null;

    const previousListHeight = previousList.hidden ? 0 : previousList.getBoundingClientRect().height;
    const currentListHeight = currentList.hidden ? 0 : currentList.getBoundingClientRect().height;
    const currentChromeHeight = startHeight - currentListHeight;
    const previousChromeHeight = previousSection.getBoundingClientRect().height - previousListHeight;
    const totalListHeight = previousListHeight + currentListHeight;
    const previousIsCollapsed = previousList.hidden;
    const minimumCurrentListHeight = wasCollapsed ? 0 : Math.max(0, 100 - currentChromeHeight);
    const minimumPreviousListHeight = previousIsCollapsed
      ? 0
      : Math.max(0, 100 - previousChromeHeight);

    return ({ requestedHeight }) => {
      const requestedListHeight = requestedHeight - currentChromeHeight;
      const maximumCurrentListHeight = Math.max(
        minimumCurrentListHeight,
        totalListHeight - minimumPreviousListHeight
      );
      const nextCurrentListHeight = Math.max(
        minimumCurrentListHeight,
        Math.min(maximumCurrentListHeight, requestedListHeight)
      );
      const nextPreviousListHeight = totalListHeight - nextCurrentListHeight;

      currentList.hidden = false;
      currentList.style.height = `${nextCurrentListHeight}px`;
      currentList.style.maxHeight = `${nextCurrentListHeight}px`;
      this.#manualListHeights.set(currentToggle.dataset.imageList, nextCurrentListHeight);

      if (!previousIsCollapsed) {
        previousList.style.height = `${nextPreviousListHeight}px`;
        previousList.style.maxHeight = `${nextPreviousListHeight}px`;
        this.#manualListHeights.set(previousToggle.dataset.imageList, nextPreviousListHeight);
      }

      return currentChromeHeight + nextCurrentListHeight;
    };
  }

  #getListHeight(section, sectionHeight) {
    const header = section.querySelector(".director-image-list-header");
    const headerMargin = header ? Number.parseFloat(getComputedStyle(header).marginBottom) || 0 : 0;
    return Math.max(0, sectionHeight - (header?.getBoundingClientRect().height ?? 0) - headerMargin);
  }

  #destroyResizableSections() {
    this.#resizableSections.forEach(section => section.destroy());
    this.#resizableSections = [];
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

    const manualHeights = visibleLists.map(list => {
      const listId = list.closest(".director-image-control-group")
        ?.querySelector(".btn-toggle-image-list")?.dataset.imageList;
      return this.#manualListHeights.get(listId);
    });

    if (manualHeights.some(height => height !== undefined)) {
      targetHeights = Array(visibleLists.length).fill(0);
      let remainingHeight = availableHeight;
      manualHeights.forEach((height, index) => {
        if (height === undefined) return;
        targetHeights[index] = Math.min(height, remainingHeight);
        remainingHeight -= targetHeights[index];
      });
      manualHeights.forEach((height, index) => {
        if (height !== undefined) return;
        targetHeights[index] = Math.min(requiredHeights[index], remainingHeight);
        remainingHeight -= targetHeights[index];
      });
    } else if (requiredHeights.length === 1) {
      targetHeights = [Math.min(requiredHeights[0], availableHeight)];
    } else if (requiredHeights[0] > halfHeight && requiredHeights[1] > halfHeight) {
      targetHeights = [halfHeight, halfHeight];
    } else if (requiredHeights[0] <= halfHeight) {
      targetHeights = [requiredHeights[0], Math.min(requiredHeights[1], availableHeight - requiredHeights[0])];
    } else {
      targetHeights = [Math.min(requiredHeights[0], availableHeight - requiredHeights[1]), requiredHeights[1]];
    }

    visibleLists.forEach((list, index) => {
      const height = `${targetHeights[index]}px`;
      list.style.maxHeight = height;
      const listId = list.closest(".director-image-control-group")
        ?.querySelector(".btn-toggle-image-list")?.dataset.imageList;
      list.style.height = this.#manualListHeights.has(listId) ? height : "";
    });
  }

  /**
   * Destroys the panel and releases its DOM reference.
   */
  destroy() {
    this.#destroyResizableSections();
    this.#destroyPanelResizeController();
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
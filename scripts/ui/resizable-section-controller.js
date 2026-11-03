export class ResizableSectionController {
  #section;
  #header;
  #content;
  #toggleButton;
  #isCollapsed;
  #expandedHeight;
  #minHeight;
  #getMaxHeight;
  #applyHeight;
  #onChange;
  #expandLabel;
  #collapseLabel;
  #collapsedIcon;
  #expandedIcon;
  #listeners = new AbortController();
  #dragListeners = null;

  constructor({
    section,
    header,
    content,
    toggleButton,
    isCollapsed = false,
    expandedHeight = null,
    minHeight = 100,
    getMaxHeight = () => section.parentElement?.clientHeight ?? window.innerHeight,
    applyHeight = () => {},
    onChange = () => {},
    expandLabel,
    collapseLabel,
    collapsedIcon = "fa-chevron-right",
    expandedIcon = "fa-chevron-down"
  }) {
    this.#section = section;
    this.#header = header;
    this.#content = content;
    this.#toggleButton = toggleButton;
    this.#isCollapsed = isCollapsed;
    this.#expandedHeight = expandedHeight;
    this.#minHeight = minHeight;
    this.#getMaxHeight = getMaxHeight;
    this.#applyHeight = applyHeight;
    this.#onChange = onChange;
    this.#expandLabel = expandLabel;
    this.#collapseLabel = collapseLabel;
    this.#collapsedIcon = collapsedIcon;
    this.#expandedIcon = expandedIcon;

    this.#applyState();
    toggleButton.addEventListener("click", this.#handleToggle, { signal: this.#listeners.signal });
    header.addEventListener("pointerdown", this.#handlePointerDown, { signal: this.#listeners.signal });
  }

  #handleToggle = event => {
    event.preventDefault();
    this.#setCollapsed(!this.#isCollapsed);
  };

  #handlePointerDown = event => {
    if (event.target instanceof Element && event.target.closest("button")) return;

    const wasCollapsed = this.#isCollapsed;
    const startHeight = this.#section.getBoundingClientRect().height;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    this.#dragListeners?.abort();
    this.#dragListeners = new AbortController();
    const { signal } = this.#dragListeners;

    const onPointerMove = moveEvent => {
      if (moveEvent.pointerId !== pointerId) return;
      if (this.#isCollapsed) this.#setCollapsed(false);

      const minHeight = wasCollapsed ? startHeight : this.#minHeight;
      const maxHeight = Math.max(minHeight, this.#getMaxHeight());
      this.#expandedHeight = Math.max(
        minHeight,
        Math.min(maxHeight, startHeight + startY - moveEvent.clientY)
      );
      this.#applyHeight({ isCollapsed: false, expandedHeight: this.#expandedHeight });
      this.#notifyChange();
      moveEvent.preventDefault();
    };
    const onPointerEnd = endEvent => {
      if (endEvent.pointerId === pointerId) this.#dragListeners?.abort();
    };

    document.addEventListener("pointermove", onPointerMove, { signal });
    document.addEventListener("pointerup", onPointerEnd, { signal });
    document.addEventListener("pointercancel", onPointerEnd, { signal });
    event.preventDefault();
  };

  #setCollapsed(isCollapsed) {
    if (this.#isCollapsed === isCollapsed) return;
    if (isCollapsed) this.#expandedHeight = this.#section.getBoundingClientRect().height;

    this.#isCollapsed = isCollapsed;
    this.#applyState();
    this.#notifyChange();
  }

  #applyState() {
    this.#section.classList.toggle("is-collapsed", this.#isCollapsed);
    this.#content.hidden = this.#isCollapsed;
    this.#applyHeight({
      isCollapsed: this.#isCollapsed,
      expandedHeight: this.#expandedHeight
    });

    this.#toggleButton.setAttribute("aria-expanded", String(!this.#isCollapsed));
    this.#toggleButton.title = game.i18n.localize(
      this.#isCollapsed ? this.#expandLabel : this.#collapseLabel
    );
    this.#toggleButton.setAttribute("aria-label", this.#toggleButton.title);

    const icon = this.#toggleButton.querySelector("i");
    if (icon) {
      icon.className = `fas ${this.#isCollapsed ? this.#collapsedIcon : this.#expandedIcon}`;
    }
  }

  #notifyChange() {
    this.#onChange({
      isCollapsed: this.#isCollapsed,
      expandedHeight: this.#expandedHeight
    });
  }

  destroy() {
    this.#listeners.abort();
    this.#dragListeners?.abort();
    this.#dragListeners = null;
  }
}
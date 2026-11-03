export class ResizablePanelController {
  #panel;
  #handle;
  #edge;
  #minWidth;
  #getMaxWidth;
  #isEnabled;
  #onResize;
  #onToggle;
  #listeners = new AbortController();
  #dragListeners = null;
  #wasDragged = false;
  #suppressNextClick = false;

  constructor({
    panel,
    handle,
    edge,
    minWidth,
    maxWidth,
    getMaxWidth = () => maxWidth,
    initialWidth = null,
    isEnabled = () => true,
    onResize = () => {},
    onToggle = () => {}
  }) {
    this.#panel = panel;
    this.#handle = handle;
    this.#edge = edge;
    this.#minWidth = minWidth;
    this.#getMaxWidth = getMaxWidth;
    this.#isEnabled = isEnabled;
    this.#onResize = onResize;
    this.#onToggle = onToggle;

    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-valuemin", String(minWidth));
    handle.setAttribute("aria-valuemax", String(Math.round(this.#getMaxWidth())));
    handle.tabIndex = 0;
    if (initialWidth !== null) this.#setWidth(initialWidth);
    handle.addEventListener("pointerdown", this.#handlePointerDown, {
      signal: this.#listeners.signal
    });
    handle.addEventListener("keydown", this.#handleKeyDown, {
      signal: this.#listeners.signal
    });
    handle.addEventListener("click", this.#handleClick, {
      signal: this.#listeners.signal
    });
  }

  #handleClick = event => {
    if (this.#suppressNextClick) {
      event.preventDefault();
      this.#suppressNextClick = false;
      return;
    }

    this.#onToggle();
  };

  #handlePointerDown = event => {
    if (!this.#isEnabled()) return;

    this.#wasDragged = false;
    const startWidth = this.#panel.getBoundingClientRect().width;
    this.#handle.setAttribute("aria-valuenow", String(Math.round(startWidth)));
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    this.#dragListeners?.abort();
    this.#dragListeners = new AbortController();
    const { signal } = this.#dragListeners;

    const onPointerMove = moveEvent => {
      if (moveEvent.pointerId !== pointerId) return;
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 3) {
        this.#wasDragged = true;
      }
      if (!this.#wasDragged) return;

      const direction = this.#edge === "right" ? 1 : -1;
      this.#setWidth(startWidth + (moveEvent.clientX - startX) * direction);
      moveEvent.preventDefault();
    };
    const onPointerEnd = endEvent => {
      if (endEvent.pointerId !== pointerId) return;
      this.#dragListeners?.abort();
      if (endEvent.type === "pointerup" && !this.#wasDragged) this.#onToggle();
      this.#suppressNextClick = true;
      window.setTimeout(() => {
        this.#suppressNextClick = false;
        this.#wasDragged = false;
      }, 0);
    };

    document.addEventListener("pointermove", onPointerMove, { signal });
    document.addEventListener("pointerup", onPointerEnd, { signal });
    document.addEventListener("pointercancel", onPointerEnd, { signal });
  };

  #handleKeyDown = event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.#onToggle();
      return;
    }

    if (!this.#isEnabled()) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const step = event.shiftKey ? 32 : 8;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    this.#setWidth(this.#panel.getBoundingClientRect().width + step * direction);
  };

  #setWidth(width) {
    const maxWidth = Math.max(this.#minWidth, this.#getMaxWidth());
    const nextWidth = Math.max(this.#minWidth, Math.min(maxWidth, width));
    this.#panel.style.width = `${nextWidth}px`;
    this.#handle.setAttribute("aria-valuemax", String(Math.round(maxWidth)));
    this.#handle.setAttribute("aria-valuenow", String(Math.round(nextWidth)));
    this.#onResize(nextWidth);
  }

  destroy() {
    this.#listeners.abort();
    this.#dragListeners?.abort();
    this.#dragListeners = null;
  }
}
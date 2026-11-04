export class ResizablePanelController {
  #panel;
  #handle;
  #edge;
  #minWidth;
  #minContentWidth;
  #getMaxWidth;
  #getIsCollapsed;
  #onResize;
  #onOverflow;
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
    minContentWidth = null,
    maxWidth,
    getMaxWidth = () => maxWidth,
    initialWidth = null,
    initialOverflowOffset = 0,
    isCollapsed = () => false,
    onResize = () => {},
    onOverflow = () => {},
    onToggle = () => {}
  }) {
    this.#panel = panel;
    this.#handle = handle;
    this.#edge = edge;
    this.#minWidth = minWidth;
    this.#minContentWidth = minContentWidth;
    this.#getMaxWidth = getMaxWidth;
    this.#getIsCollapsed = isCollapsed;
    this.#onResize = onResize;
    this.#onOverflow = onOverflow;
    this.#onToggle = onToggle;

    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-valuemin", String(Math.round(this.#getMinimumWidth())));
    handle.setAttribute("aria-valuemax", String(Math.round(this.#getMaxWidth())));
    handle.tabIndex = 0;
    if (initialOverflowOffset !== 0) this.#onOverflow(initialOverflowOffset);
    if (initialWidth !== null) {
      this.#resizeTo(initialWidth, { expandIfCollapsed: false });
      if (initialWidth < this.#minWidth && !this.#getIsCollapsed()) this.#onToggle();
    } else {
      const currentWidth = panel.getBoundingClientRect().width;
      if (currentWidth < this.#getMinimumWidth()) this.#setWidth(currentWidth);
    }
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
    this.#wasDragged = false;
    let requestedWidth = this.#getLogicalWidth();
    const startWidth = requestedWidth;
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
      requestedWidth = startWidth + (moveEvent.clientX - startX) * direction;
      this.#resizeTo(requestedWidth);
      moveEvent.preventDefault();
    };
    const onPointerEnd = endEvent => {
      if (endEvent.pointerId !== pointerId) return;
      this.#dragListeners?.abort();
      if (endEvent.type === "pointerup" && !this.#wasDragged) this.#onToggle();
      else if (this.#wasDragged && requestedWidth < this.#minWidth && !this.#getIsCollapsed()) {
        this.#onToggle();
      }
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

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const step = event.shiftKey ? 32 : 8;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const requestedWidth = this.#getLogicalWidth() + step * direction;
    this.#resizeTo(requestedWidth);
    if (requestedWidth < this.#minWidth && !this.#getIsCollapsed()) this.#onToggle();
  };

  #resizeTo(requestedWidth, { expandIfCollapsed = true } = {}) {
    if (requestedWidth < this.#minWidth) {
      const minimumWidth = this.#getMinimumWidth();
      const overflowOffset = this.#edge === "right"
        ? requestedWidth - minimumWidth
        : minimumWidth - requestedWidth;
      this.#setWidth(minimumWidth);
      this.#onOverflow(overflowOffset);
      return;
    }

    if (expandIfCollapsed && this.#getIsCollapsed()) this.#onToggle();
    const minWidth = this.#getMinimumWidth();
    const maxWidth = Math.max(minWidth, this.#getMaxWidth());
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, requestedWidth));
    const overflowOffset = this.#edge === "right"
      ? requestedWidth - nextWidth
      : nextWidth - requestedWidth;
    this.#setWidth(nextWidth);
    this.#onOverflow(overflowOffset);
  }

  #getLogicalWidth() {
    const bounds = this.#panel.getBoundingClientRect();
    const styles = getComputedStyle(this.#panel);
    const overflowOffset = Number.parseFloat(
      styles.getPropertyValue("--nc-panel-overflow-offset")
    ) || 0;

    if (this.#edge === "right") {
      const baseLeft = (Number.parseFloat(styles.left) || 0) - overflowOffset;
      return bounds.right - baseLeft;
    }

    const parentWidth = this.#panel.parentElement?.clientWidth ?? window.innerWidth;
    const baseRight = parentWidth - ((Number.parseFloat(styles.right) || 0) + overflowOffset);
    return baseRight - bounds.left;
  }

  #getMinimumWidth() {
    if (this.#minContentWidth === null) return this.#minWidth;

    const styles = getComputedStyle(this.#panel);
    const horizontalChrome = [
      styles.paddingLeft,
      styles.paddingRight,
      styles.borderLeftWidth,
      styles.borderRightWidth
    ].reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
    return Math.max(this.#minWidth, this.#minContentWidth + horizontalChrome);
  }

  #setWidth(width) {
    const minWidth = this.#getMinimumWidth();
    const maxWidth = Math.max(minWidth, this.#getMaxWidth());
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, width));
    this.#panel.style.width = `${nextWidth}px`;
    this.#handle.setAttribute("aria-valuemax", String(Math.round(maxWidth)));
    this.#handle.setAttribute("aria-valuemin", String(Math.round(minWidth)));
    this.#handle.setAttribute("aria-valuenow", String(Math.round(nextWidth)));
    this.#onResize(nextWidth);
  }

  destroy() {
    this.#listeners.abort();
    this.#dragListeners?.abort();
    this.#dragListeners = null;
  }
}
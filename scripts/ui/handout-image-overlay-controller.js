import { LayoutRegistry } from "./layout/layout-registry.js";

export class HandoutImageOverlayController {
  constructor({ animateOpacity, fadeOutAndRemove, isAnimatingOpacity, onLayoutChange, onCloseImage, canControl, getLayoutOptions }) {
    this.getLayoutOptions = getLayoutOptions;
    this.layout = LayoutRegistry.create("handout", LayoutRegistry.getDefaultId("handout"));
    this.managed = false;
    this.panels = new Map();
    this.resizeObserver = null;
    this.animateOpacity = animateOpacity;
    this.fadeOutAndRemove = fadeOutAndRemove;
    this.isAnimatingOpacity = isAnimatingOpacity;
    this.onLayoutChange = onLayoutChange;
    this.onCloseImage = onCloseImage;
    this.canControl = canControl;
    this.stage = null;
    this.zIndex = 12;
    this.drag = null;
    this.pointerHandlers = null;
    this.overlayOrder = [];
    this.domOrder = [];
    this.positions = new Map();
    this.sizes = new Map();
    this.pendingLayoutChange = false;
    this.layoutChangeFrame = null;
    this.duration = 400;
  }

  mount(stage, duration = 400) {
    this.stage = stage;
    this.duration = duration;
    const overlays = [...stage.querySelectorAll(".narrative-handout-image-overlay")];
    overlays.forEach((overlay, index) => {
      overlay.style.zIndex = String(++this.zIndex);
      const position = this.#readPosition(overlay) ?? this.#defaultPosition(index);
      this.positions.set(overlay.dataset.overlayId, position);
      this.sizes.set(overlay.dataset.overlayId, this.#readSize(overlay));
      this.#applyPosition(overlay, position);
    });
    this.overlayOrder = overlays.map(overlay => overlay.dataset.overlayId);
    this.domOrder = [...this.overlayOrder];
    this.#bindPointerHandlers();
    overlays.forEach(overlay => this.#watchImage(overlay.querySelector(".narrative-scene-handout-image")));
    this.resizeObserver = new ResizeObserver(() => this.#syncLayout());
    this.resizeObserver.observe(stage);
    this.#syncLayout();
  }

  update(overlays, duration) {
    if (!this.stage) return;
    this.duration = duration;
    const nextOrder = overlays.map(overlay => overlay.id);
    const orderChanged = nextOrder.length !== this.overlayOrder.length
      || nextOrder.some((id, index) => id !== this.overlayOrder[index]);
    const sameOverlaySet = orderChanged
      && nextOrder.length === this.overlayOrder.length
      && nextOrder.every(id => this.overlayOrder.includes(id));
    const remainingOverlays = new Map(
      [...this.stage.querySelectorAll(".narrative-handout-image-overlay")]
        .map(overlay => [overlay.dataset.overlayId, overlay])
    );
    const activeOverlays = new Map();
    const overlayLayer = this.stage.querySelector(".narrative-handout-image-layer") ?? this.stage;

    for (const data of overlays) {
      let overlay = remainingOverlays.get(data.id);
      const isNewOverlay = !overlay;
      if (overlay) {
        remainingOverlays.delete(data.id);
      } else {
        overlay = this.#createOverlay(data);
        overlayLayer.appendChild(overlay);
        overlay.style.zIndex = String(++this.zIndex);
        overlay.style.opacity = "0";
        this.animateOpacity(overlay, 1, duration);
      }
      activeOverlays.set(data.id, overlay);
      const position = data.position ?? this.positions.get(data.id)
        ?? this.#defaultPosition(this.stage.querySelectorAll(".narrative-handout-image-overlay").length - 1);
      this.positions.set(data.id, position);
      const size = this.#clampSize(data.size ?? this.sizes.get(data.id) ?? 1);
      this.sizes.set(data.id, size);
      if (this.drag?.overlayId !== data.id) this.#applyPosition(overlay, position);

      const image = overlay.querySelector(".narrative-scene-handout-image");
      image.alt = data.title || "";
      if (image.getAttribute("src") !== data.src) image.src = data.src;
      let description = overlay.querySelector(".narrative-scene-handout-image-description");
      if (!description && data.description) {
        description = document.createElement("div");
        description.className = "narrative-scene-handout-image-description";
        overlay.querySelector(".narrative-scene-handout-image-frame").appendChild(description);
      }
      if (description) {
        description.innerHTML = foundry.utils.cleanHTML(data.description || "");
        description.hidden = !data.description;
      }
      if (!isNewOverlay && this.isAnimatingOpacity(overlay)) {
        this.animateOpacity(overlay, 1, duration);
      }
    }

    for (const overlay of remainingOverlays.values()) {
      this.positions.delete(overlay.dataset.overlayId);
      this.sizes.delete(overlay.dataset.overlayId);
      this.fadeOutAndRemove(overlay, duration);
    }

    if (orderChanged) {
      if (sameOverlaySet) {
        this.#setOverlayOrder(nextOrder);
      } else {
        this.#setOverlayOrder(nextOrder);
      }
    }
    this.#syncLayout();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.drag = null;
    if (this.layoutChangeFrame !== null) {
      cancelAnimationFrame(this.layoutChangeFrame);
      this.layoutChangeFrame = null;
    }
    if (this.stage && this.pointerHandlers) {
      this.stage.removeEventListener("pointerdown", this.pointerHandlers.pointerdown, true);
      this.stage.removeEventListener("pointermove", this.pointerHandlers.pointermove, true);
      this.stage.removeEventListener("pointerup", this.pointerHandlers.finishDrag, true);
      this.stage.removeEventListener("pointercancel", this.pointerHandlers.finishDrag, true);
      this.stage.removeEventListener("click", this.pointerHandlers.closeImage, true);
    }
    this.stage = null;
    this.pointerHandlers = null;
    this.overlayOrder = [];
    this.domOrder = [];
    this.positions.clear();
    this.sizes.clear();
    this.pendingLayoutChange = false;
  }

  applyLayout(layout) {
    if (!this.stage || !Array.isArray(layout)) return;

    const nextOrder = [];
    for (const item of layout) {
      const overlay = this.stage.querySelector(
        `.narrative-handout-image-overlay[data-overlay-id="${item.id}"]`
      );
      if (!overlay) continue;

      const x = Number(item.position?.x);
      const y = Number(item.position?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        this.positions.set(item.id, {
          x,
          y
        });
      }
      const size = Number(item.size);
      if (Number.isFinite(size)) this.sizes.set(item.id, this.#clampSize(size));
      this.#applyPosition(overlay, this.positions.get(item.id) ?? { x: 0.5, y: 0.5 });
      nextOrder.push(item.id);
    }

    if (nextOrder.length !== this.overlayOrder.length) return;

    const orderChanged = nextOrder.some((id, index) => id !== this.overlayOrder[index]);
    if (orderChanged) {
      this.#setOverlayOrder(nextOrder);
      this.#syncLayout();
    }
  }

  #createOverlay(data) {
    const overlay = document.createElement("div");
    overlay.className = "narrative-handout-image-overlay";
    overlay.dataset.overlayId = data.id;
    overlay.dataset.size = String(this.#clampSize(data.size ?? 1));

    const frame = document.createElement("div");
    frame.className = "narrative-scene-handout-image-frame";
    const image = document.createElement("img");
    image.className = "narrative-scene-handout-image";
    image.src = data.src;
    image.alt = data.title || "";
    image.draggable = false;
    this.#watchImage(image);

    const description = document.createElement("div");
    description.className = "narrative-scene-handout-image-description";
    description.innerHTML = foundry.utils.cleanHTML(data.description || "");
    description.hidden = !data.description;
    frame.append(image, description);

    if (game.user.isGM) {
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "btn-close-handout-image";
      closeButton.dataset.overlayId = data.id;
      closeButton.title = game.i18n.localize("NARRATIVE_CANVAS.Director.CloseImageOverlay");
      closeButton.setAttribute("aria-label", closeButton.title);
      closeButton.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
      frame.appendChild(closeButton);

      const resizeHandle = document.createElement("button");
      resizeHandle.type = "button";
      resizeHandle.className = "btn-resize-handout-image";
      resizeHandle.dataset.overlayId = data.id;
      resizeHandle.title = game.i18n.localize("NARRATIVE_CANVAS.Director.ResizeImageOverlay");
      resizeHandle.setAttribute("aria-label", resizeHandle.title);
      resizeHandle.innerHTML = '<i class="fas fa-expand-alt" aria-hidden="true"></i>';
      frame.appendChild(resizeHandle);
    }

    overlay.appendChild(frame);
    return overlay;
  }

  #watchImage(image) {
    image?.addEventListener("load", () => this.#syncLayout());
  }

  /** Applies the configured layout strategy, or restores manual placement when it has none. */
  #syncLayout() {
    if (!this.stage) return;
    const wasManaged = this.managed;
    const options = this.getLayoutOptions?.() ?? {};
    if ((options.strategy ?? LayoutRegistry.getDefaultId("handout")) !== this.layout.constructor.id) {
      if (this.layout.cssClass) this.stage.classList.remove(this.layout.cssClass);
      this.layout = LayoutRegistry.create("handout", options.strategy);
    }
    this.managed = !this.layout.isManual;
    if (this.layout.cssClass) this.stage.classList.add(this.layout.cssClass);
    this.stage.dataset.comicCaption = options.captionPosition ?? "bottom";

    const overlays = this.overlayOrder
      .map(id => this.stage.querySelector(`.narrative-handout-image-overlay[data-overlay-id="${id}"]`))
      .filter(Boolean);

    if (!this.managed) {
      if (!wasManaged) return;
      for (const overlay of overlays) {
        const frame = overlay.querySelector(".narrative-scene-handout-image-frame");
        frame.style.width = "";
        frame.style.height = "";
        this.#applyPosition(overlay, this.positions.get(overlay.dataset.overlayId) ?? { x: 0.5, y: 0.5 });
      }
      return;
    }

    const layer = this.stage.querySelector(".narrative-handout-image-layer") ?? this.stage;
    const bounds = layer.getBoundingClientRect();
    const items = overlays.map(overlay => {
      const image = overlay.querySelector(".narrative-scene-handout-image");
      return { ratio: image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 0 };
    });
    const panels = this.layout.compute(items, bounds, options) ?? [];
    overlays.forEach((overlay, index) => {
      const panel = panels[index];
      if (!panel) return;
      this.panels.set(overlay.dataset.overlayId, panel);
      if (this.drag?.mode === "reorder" && this.drag.overlayId === overlay.dataset.overlayId) return;
      const frame = overlay.querySelector(".narrative-scene-handout-image-frame");
      frame.style.left = `${panel.left * 100}%`;
      frame.style.top = `${panel.top * 100}%`;
      frame.style.width = `${panel.width * 100}%`;
      frame.style.height = `${panel.height * 100}%`;
      frame.style.transform = "none";
      frame.style.setProperty("--handout-image-scale-inverse", "1");
    });
  }

  #readPosition(overlay) {
    const rawX = overlay.dataset.positionX;
    const rawY = overlay.dataset.positionY;
    if (!rawX || !rawY) return null;
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  #readSize(overlay) {
    return this.#clampSize(Number(overlay.dataset.size) || 1);
  }

  #clampSize(size) {
    return Math.max(0.25, Math.min(1.5, size));
  }

  #defaultPosition(index) {
    const bounds = this.stage.getBoundingClientRect();
    const offset = Math.min(index, 5) * 32;
    return {
      x: bounds.width ? Math.min(0.95, 0.5 + offset / bounds.width) : 0.5,
      y: bounds.height ? Math.min(0.95, 0.5 + offset / bounds.height) : 0.5
    };
  }

  #applyPosition(overlay, position) {
    if (!overlay || this.managed) return;
    const frame = overlay.querySelector(".narrative-scene-handout-image-frame");
    const size = this.sizes.get(overlay.dataset.overlayId) ?? 1;
    frame.style.left = `${position.x * 100}%`;
    frame.style.top = `${position.y * 100}%`;
    frame.style.setProperty("--handout-image-scale-inverse", String(1 / size));
    frame.style.transform = `translate(-50%, -50%) scale(${size})`;
  }

  #applySize(overlayId, size) {
    const overlay = this.stage.querySelector(`.narrative-handout-image-overlay[data-overlay-id="${overlayId}"]`);
    if (!overlay) return;

    const clampedSize = this.#clampSize(size);
    this.sizes.set(overlayId, clampedSize);
    overlay.dataset.size = String(clampedSize);
    const frame = overlay.querySelector(".narrative-scene-handout-image-frame");
    frame.style.setProperty("--handout-image-scale-inverse", String(1 / clampedSize));
    frame.style.transform = `translate(-50%, -50%) scale(${clampedSize})`;
  }

  #raiseOverlay(overlay) {
    const overlayId = overlay.dataset.overlayId;
    const nextOrder = this.overlayOrder.filter(id => id !== overlayId);
    nextOrder.push(overlayId);
    if (nextOrder.every((id, index) => id === this.overlayOrder[index])) return false;

    this.#setOverlayOrder(nextOrder);
    this.pendingLayoutChange = true;
    this.#scheduleLayoutChange();
    return true;
  }

  #setOverlayOrder(nextOrder) {
    this.overlayOrder = [...nextOrder];
    this.domOrder = [...nextOrder];
    this.#applyOverlayOrder(nextOrder);
  }

  #applyOverlayOrder(order) {
    for (const [index, id] of order.entries()) {
      const element = this.stage.querySelector(`.narrative-handout-image-overlay[data-overlay-id="${id}"]`);
      if (element) element.style.zIndex = String(13 + index);
    }
    this.zIndex = 12 + order.length;
  }

  #scheduleLayoutChange() {
    if (!this.canControl?.() || this.layoutChangeFrame !== null) return;
    this.layoutChangeFrame = requestAnimationFrame(() => {
      this.layoutChangeFrame = null;
      this.#emitLayoutChange();
    });
  }

  #emitLayoutChange(isFinal = false) {
    if (!this.canControl?.()) return;
    this.onLayoutChange?.(this.overlayOrder.map(id => ({
      id,
      position: this.positions.get(id) ?? { x: 0.5, y: 0.5 },
      size: this.sizes.get(id) ?? 1
    })), isFinal);
  }

  #startReorder(event) {
    const image = event.target instanceof Element ? event.target.closest(".narrative-scene-handout-image") : null;
    const overlay = image?.closest(".narrative-handout-image-overlay");
    if (!overlay || !this.stage.contains(overlay)) return;

    const frame = image.closest(".narrative-scene-handout-image-frame");
    const frameBounds = frame.getBoundingClientRect();
    this.drag = {
      mode: "reorder",
      pointerId: event.pointerId,
      overlayId: overlay.dataset.overlayId,
      frame,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - frameBounds.left,
      offsetY: event.clientY - frameBounds.top,
      moved: false
    };
    image.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  /** The dragged panel follows the pointer; the order changes to the slot nearest to it. */
  #moveReorder(event) {
    const drag = this.drag;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      drag.moved = true;
      drag.frame.classList.add("is-reordering");
    }
    event.preventDefault();

    const layer = this.stage.querySelector(".narrative-handout-image-layer") ?? this.stage;
    const bounds = layer.getBoundingClientRect();
    const overlay = drag.frame.closest(".narrative-handout-image-overlay");
    overlay.style.zIndex = "999";
    drag.frame.style.left = `${(event.clientX - drag.offsetX - bounds.left) / bounds.width * 100}%`;
    drag.frame.style.top = `${(event.clientY - drag.offsetY - bounds.top) / bounds.height * 100}%`;

    const pointer = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
    let nearestId = null;
    let nearestDistance = Infinity;
    for (const [id, panel] of this.panels) {
      if (!this.overlayOrder.includes(id)) continue;
      const distance = Math.hypot(pointer.x - (panel.left + panel.width / 2), pointer.y - (panel.top + panel.height / 2));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = id;
      }
    }
    if (!nearestId || nearestId === drag.overlayId) return;

    const nextOrder = this.overlayOrder.filter(id => id !== drag.overlayId);
    nextOrder.splice(this.overlayOrder.indexOf(nearestId), 0, drag.overlayId);
    this.#setOverlayOrder(nextOrder);
    overlay.style.zIndex = "999";
    this.#syncLayout();
    this.pendingLayoutChange = true;
    this.#scheduleLayoutChange();
  }

  #bindPointerHandlers() {
    const pointerdown = (event) => {
      if (!this.canControl?.()) return;
      if (this.managed) {
        this.#startReorder(event);
        return;
      }
      const overlay = event.target.closest(".narrative-handout-image-overlay");
      if (!overlay || !this.stage.contains(overlay)) return;
      this.#raiseOverlay(overlay);

      const resizeHandle = event.target.closest(".btn-resize-handout-image");
      if (resizeHandle) {
        const frame = resizeHandle.closest(".narrative-scene-handout-image-frame");
        const frameBounds = frame.getBoundingClientRect();
        const stageBounds = this.stage.getBoundingClientRect();
        const overlayId = overlay.dataset.overlayId;
        const startSize = this.sizes.get(overlayId) ?? 1;
        const baseWidth = frameBounds.width / startSize;
        const baseHeight = frameBounds.height / startSize;
        const maxSize = Math.min(1.5, stageBounds.width * 0.88 / baseWidth, stageBounds.height * 0.76 / baseHeight);
        this.drag = {
          mode: "resize",
          pointerId: event.pointerId,
          overlayId,
          startX: event.clientX,
          startY: event.clientY,
          startWidth: frameBounds.width,
          startHeight: frameBounds.height,
          startSize,
          maxSize: Math.max(startSize, maxSize)
        };
        resizeHandle.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }

      const image = event.target.closest(".narrative-scene-handout-image");
      if (!image) return;
      const frame = image.closest(".narrative-scene-handout-image-frame");
      const frameBounds = frame.getBoundingClientRect();
      const stageBounds = this.stage.getBoundingClientRect();
      const centerX = frameBounds.left - stageBounds.left + frameBounds.width / 2;
      const centerY = frameBounds.top - stageBounds.top + frameBounds.height / 2;
      this.drag = {
        pointerId: event.pointerId,
        mode: "move",
        overlayId: overlay.dataset.overlayId,
        frame,
        image,
        startX: event.clientX,
        startY: event.clientY,
        centerX,
        centerY
      };
      image.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const pointermove = (event) => {
      if (!this.canControl?.() || !this.drag || this.drag.pointerId !== event.pointerId) return;
      if (this.drag.mode === "reorder") {
        this.#moveReorder(event);
        return;
      }
      if (this.drag.mode === "resize") {
        const widthChange = (event.clientX - this.drag.startX) / this.drag.startWidth;
        const heightChange = (event.clientY - this.drag.startY) / this.drag.startHeight;
        const multiplier = Math.max(0.25 / this.drag.startSize, 1 + Math.max(widthChange, heightChange));
        const size = Math.min(this.drag.maxSize, this.drag.startSize * multiplier);
        this.#applySize(this.drag.overlayId, size);
        this.#scheduleLayoutChange();
        event.preventDefault();
        return;
      }

      const stageBounds = this.stage.getBoundingClientRect();
      const x = this.drag.centerX + event.clientX - this.drag.startX;
      const y = this.drag.centerY + event.clientY - this.drag.startY;
      const position = { x: x / stageBounds.width, y: y / stageBounds.height };
      this.positions.set(this.drag.overlayId, position);
      this.#applyPosition(this.stage.querySelector(
        `.narrative-handout-image-overlay[data-overlay-id="${this.drag.overlayId}"]`
      ), position);
      this.#scheduleLayoutChange();
    };
    const finishDrag = (event) => {
      const hasPointerDrag = this.drag?.pointerId === event.pointerId;
      if (!hasPointerDrag && !this.pendingLayoutChange) return;
      const reorder = hasPointerDrag && this.drag.mode === "reorder" ? this.drag : null;
      this.drag = null;
      if (reorder) {
        reorder.frame.classList.remove("is-reordering");
        this.#applyOverlayOrder(this.overlayOrder);
        this.#syncLayout();
        if (!reorder.moved && !this.pendingLayoutChange) return;
      }
      this.pendingLayoutChange = false;
      if (this.layoutChangeFrame !== null) {
        cancelAnimationFrame(this.layoutChangeFrame);
        this.layoutChangeFrame = null;
      }
      this.#emitLayoutChange(true);
    };

    const closeImage = (event) => {
      if (!this.canControl?.() || !(event.target instanceof Element)) return;
      const closeButton = event.target.closest(".btn-close-handout-image");
      if (!closeButton || !this.stage.contains(closeButton)) return;

      event.preventDefault();
      event.stopPropagation();
      this.onCloseImage?.(closeButton.dataset.overlayId);
    };

    this.pointerHandlers = { pointerdown, pointermove, finishDrag, closeImage };
    this.stage.addEventListener("pointerdown", pointerdown, true);
    this.stage.addEventListener("pointermove", pointermove, true);
    this.stage.addEventListener("pointerup", finishDrag, true);
    this.stage.addEventListener("pointercancel", finishDrag, true);
    this.stage.addEventListener("click", closeImage, true);
  }
}

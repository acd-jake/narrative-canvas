export class HandoutImageOverlayController {
  constructor({ animateOpacity, fadeOutAndRemove, isAnimatingOpacity, onLayoutChange, canControl }) {
    this.animateOpacity = animateOpacity;
    this.fadeOutAndRemove = fadeOutAndRemove;
    this.isAnimatingOpacity = isAnimatingOpacity;
    this.onLayoutChange = onLayoutChange;
    this.canControl = canControl;
    this.stage = null;
    this.zIndex = 12;
    this.drag = null;
    this.pointerHandlers = null;
    this.overlayOrder = [];
    this.domOrder = [];
    this.positions = new Map();
    this.transitioningOverlayIds = new Set();
    this.orderTransitionId = 0;
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
      this.#applyPosition(overlay, position);
    });
    this.overlayOrder = overlays.map(overlay => overlay.dataset.overlayId);
    this.domOrder = [...this.overlayOrder];
    this.#bindPointerHandlers();
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

    for (const data of overlays) {
      let overlay = remainingOverlays.get(data.id);
      const isNewOverlay = !overlay;
      if (overlay) {
        remainingOverlays.delete(data.id);
      } else {
        overlay = this.#createOverlay(data);
        this.stage.appendChild(overlay);
        overlay.style.zIndex = String(++this.zIndex);
        overlay.style.opacity = "0";
        this.animateOpacity(overlay, 1, duration);
      }
      activeOverlays.set(data.id, overlay);
      const position = data.position ?? this.positions.get(data.id)
        ?? this.#defaultPosition(this.stage.querySelectorAll(".narrative-handout-image-overlay").length - 1);
      this.positions.set(data.id, position);
      if (this.drag?.overlayId !== data.id) this.#applyPosition(overlay, position);

      const image = overlay.querySelector(".narrative-scene-handout-image");
      image.alt = data.title || "";
      if (image.getAttribute("src") !== data.src) image.src = data.src;
      const description = overlay.querySelector(".narrative-scene-handout-image-description");
      description.innerHTML = data.description || "";
      description.hidden = !data.description;
      if (!isNewOverlay && this.isAnimatingOpacity(overlay)
        && !this.transitioningOverlayIds.has(data.id)) {
        this.animateOpacity(overlay, 1, duration);
      }
    }

    for (const overlay of remainingOverlays.values()) {
      this.positions.delete(overlay.dataset.overlayId);
      this.fadeOutAndRemove(overlay, duration);
    }

    if (orderChanged) {
      if (sameOverlaySet) {
        this.#transitionToOrder(nextOrder, duration, false);
      } else {
        this.#cancelOrderTransition(nextOrder, duration);
        this.overlayOrder = [...nextOrder];
        this.domOrder = [...nextOrder];
        this.#applyOverlayOrder(nextOrder);
      }
    }
  }

  destroy() {
    this.drag = null;
    if (this.stage && this.pointerHandlers) {
      this.stage.removeEventListener("pointerdown", this.pointerHandlers.pointerdown);
      this.stage.removeEventListener("pointermove", this.pointerHandlers.pointermove);
      this.stage.removeEventListener("pointerup", this.pointerHandlers.finishDrag);
      this.stage.removeEventListener("pointercancel", this.pointerHandlers.finishDrag);
    }
    this.stage = null;
    this.pointerHandlers = null;
    this.overlayOrder = [];
    this.domOrder = [];
    this.positions.clear();
    this.transitioningOverlayIds.clear();
    this.orderTransitionId++;
  }

  #createOverlay(data) {
    const overlay = document.createElement("div");
    overlay.className = "narrative-handout-image-overlay";
    overlay.dataset.overlayId = data.id;

    const frame = document.createElement("div");
    frame.className = "narrative-scene-handout-image-frame";
    const image = document.createElement("img");
    image.className = "narrative-scene-handout-image";
    image.src = data.src;
    image.alt = data.title || "";
    image.draggable = false;

    const description = document.createElement("div");
    description.className = "narrative-scene-handout-image-description";
    description.innerHTML = data.description || "";
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
    }

    overlay.appendChild(frame);
    return overlay;
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

  #defaultPosition(index) {
    const bounds = this.stage.getBoundingClientRect();
    const offset = Math.min(index, 5) * 32;
    return {
      x: bounds.width ? Math.min(0.95, 0.5 + offset / bounds.width) : 0.5,
      y: bounds.height ? Math.min(0.95, 0.5 + offset / bounds.height) : 0.5
    };
  }

  #applyPosition(overlay, position) {
    if (!overlay) return;
    const frame = overlay.querySelector(".narrative-scene-handout-image-frame");
    frame.style.left = `${Math.max(0, Math.min(1, position.x)) * 100}%`;
    frame.style.top = `${Math.max(0, Math.min(1, position.y)) * 100}%`;
    frame.style.transform = "translate(-50%, -50%)";
  }

  #raiseOverlay(overlay) {
    const overlayId = overlay.dataset.overlayId;
    const nextOrder = this.overlayOrder.filter(id => id !== overlayId);
    nextOrder.push(overlayId);
    if (nextOrder.every((id, index) => id === this.overlayOrder[index])) return;

    this.#transitionToOrder(nextOrder, this.duration, true);
  }

  #transitionToOrder(nextOrder, duration, notify) {
    const transitionId = ++this.orderTransitionId;
    const targetIndex = this.domOrder.indexOf(nextOrder.at(-1));
    const outgoingIds = targetIndex < 0 ? [] : this.domOrder.slice(targetIndex + 1);
    const outgoingOverlays = outgoingIds
      .map(id => this.stage.querySelector(`.narrative-handout-image-overlay[data-overlay-id="${id}"]`))
      .filter(Boolean);

    this.overlayOrder = [...nextOrder];
    this.transitioningOverlayIds = new Set(outgoingIds);
    if (notify) this.#emitLayoutChange();

    if (!outgoingOverlays.length) {
      this.#applyOverlayOrder(nextOrder);
      this.domOrder = [...nextOrder];
      this.transitioningOverlayIds.clear();
      return;
    }

    Promise.all(outgoingOverlays.map(overlay => this.animateOpacity(overlay, 0, duration)))
      .then(completed => {
        if (transitionId !== this.orderTransitionId || completed.some(result => !result)) return;
        this.#applyOverlayOrder(nextOrder);
        this.domOrder = [...nextOrder];
        return Promise.all(outgoingOverlays.map(overlay => this.animateOpacity(overlay, 1, duration)));
      })
      .finally(() => {
        if (transitionId === this.orderTransitionId) this.transitioningOverlayIds.clear();
      });
  }

  #cancelOrderTransition(nextOrder, duration) {
    this.orderTransitionId++;
    for (const id of this.transitioningOverlayIds) {
      if (!nextOrder.includes(id)) continue;
      const overlay = this.stage.querySelector(`.narrative-handout-image-overlay[data-overlay-id="${id}"]`);
      if (overlay) this.animateOpacity(overlay, 1, duration);
    }
    this.transitioningOverlayIds.clear();
  }

  #applyOverlayOrder(order) {
    for (const [index, id] of order.entries()) {
      const element = this.stage.querySelector(`.narrative-handout-image-overlay[data-overlay-id="${id}"]`);
      if (element) element.style.zIndex = String(13 + index);
    }
    this.zIndex = 12 + order.length;
  }

  #emitLayoutChange() {
    if (!this.canControl?.()) return;
    this.onLayoutChange?.(this.overlayOrder.map(id => ({
      id,
      position: this.positions.get(id) ?? { x: 0.5, y: 0.5 }
    })));
  }

  #bindPointerHandlers() {
    const pointerdown = (event) => {
      if (!this.canControl?.()) return;
      const overlay = event.target.closest(".narrative-handout-image-overlay");
      if (!overlay || !this.stage.contains(overlay)) return;
      this.#raiseOverlay(overlay);

      const image = event.target.closest(".narrative-scene-handout-image");
      if (!image) return;
      const frame = image.closest(".narrative-scene-handout-image-frame");
      const frameBounds = frame.getBoundingClientRect();
      const stageBounds = this.stage.getBoundingClientRect();
      const centerX = frameBounds.left - stageBounds.left + frameBounds.width / 2;
      const centerY = frameBounds.top - stageBounds.top + frameBounds.height / 2;
      this.drag = {
        pointerId: event.pointerId,
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
      const stageBounds = this.stage.getBoundingClientRect();
      const frameBounds = this.drag.frame.getBoundingClientRect();
      const halfWidth = frameBounds.width / 2;
      const halfHeight = frameBounds.height / 2;
      const x = Math.max(halfWidth, Math.min(stageBounds.width - halfWidth,
        this.drag.centerX + event.clientX - this.drag.startX));
      const y = Math.max(halfHeight, Math.min(stageBounds.height - halfHeight,
        this.drag.centerY + event.clientY - this.drag.startY));
      const position = { x: x / stageBounds.width, y: y / stageBounds.height };
      this.positions.set(this.drag.overlayId, position);
      this.#applyPosition(this.stage.querySelector(
        `.narrative-handout-image-overlay[data-overlay-id="${this.drag.overlayId}"]`
      ), position);
    };
    const finishDrag = (event) => {
      if (this.drag?.pointerId !== event.pointerId) return;
      this.drag = null;
      this.#emitLayoutChange();
    };

    this.pointerHandlers = { pointerdown, pointermove, finishDrag };
    this.stage.addEventListener("pointerdown", pointerdown);
    this.stage.addEventListener("pointermove", pointermove);
    this.stage.addEventListener("pointerup", finishDrag);
    this.stage.addEventListener("pointercancel", finishDrag);
  }
}

export class HandoutImageOverlayController {
  constructor({ animateOpacity, fadeOutAndRemove, isAnimatingOpacity }) {
    this.animateOpacity = animateOpacity;
    this.fadeOutAndRemove = fadeOutAndRemove;
    this.isAnimatingOpacity = isAnimatingOpacity;
    this.stage = null;
    this.zIndex = 12;
    this.drag = null;
    this.pointerHandlers = null;
    this.overlayOrder = [];
  }

  mount(stage) {
    this.stage = stage;
    const overlays = [...stage.querySelectorAll(".narrative-handout-image-overlay")];
    overlays.forEach((overlay, index) => {
      overlay.style.zIndex = String(++this.zIndex);
      this.#offsetOverlay(overlay, index);
    });
    this.overlayOrder = overlays.map(overlay => overlay.dataset.overlayId);
    this.#bindPointerHandlers();
  }

  update(overlays, duration) {
    if (!this.stage) return;
    const nextOrder = overlays.map(overlay => overlay.id);
    const orderChanged = nextOrder.length !== this.overlayOrder.length
      || nextOrder.some((id, index) => id !== this.overlayOrder[index]);
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
        this.#offsetOverlay(overlay, this.stage.querySelectorAll(".narrative-handout-image-overlay").length - 1);
        overlay.style.opacity = "0";
        this.animateOpacity(overlay, 1, duration);
      }
      activeOverlays.set(data.id, overlay);

      const image = overlay.querySelector(".narrative-scene-handout-image");
      image.alt = data.title || "";
      if (image.getAttribute("src") !== data.src) image.src = data.src;
      const description = overlay.querySelector(".narrative-scene-handout-image-description");
      description.innerHTML = data.description || "";
      description.hidden = !data.description;
      if (!isNewOverlay && this.isAnimatingOpacity(overlay)) this.animateOpacity(overlay, 1, duration);
    }

    for (const overlay of remainingOverlays.values()) {
      this.fadeOutAndRemove(overlay, duration);
    }

    if (orderChanged) {
      for (const id of nextOrder) {
        activeOverlays.get(id).style.zIndex = String(++this.zIndex);
      }
    }
    this.overlayOrder = nextOrder;
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

  #offsetOverlay(overlay, index) {
    const frame = overlay.querySelector(".narrative-scene-handout-image-frame");
    const offset = Math.min(index, 5) * 32;
    frame.style.left = `calc(50% + ${offset}px)`;
    frame.style.top = `calc(50% + ${offset}px)`;
  }

  #bindPointerHandlers() {
    const raiseOverlay = (overlay) => {
      overlay.style.zIndex = String(++this.zIndex);
    };
    const pointerdown = (event) => {
      const overlay = event.target.closest(".narrative-handout-image-overlay");
      if (!overlay || !this.stage.contains(overlay)) return;
      raiseOverlay(overlay);

      const image = event.target.closest(".narrative-scene-handout-image");
      if (!image) return;
      const frame = image.closest(".narrative-scene-handout-image-frame");
      const frameBounds = frame.getBoundingClientRect();
      const stageBounds = this.stage.getBoundingClientRect();
      const left = frameBounds.left - stageBounds.left;
      const top = frameBounds.top - stageBounds.top;
      frame.style.left = `${left}px`;
      frame.style.top = `${top}px`;
      frame.style.transform = "none";
      this.drag = {
        pointerId: event.pointerId,
        frame,
        image,
        startX: event.clientX,
        startY: event.clientY,
        left,
        top
      };
      image.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const pointermove = (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      const stageBounds = this.stage.getBoundingClientRect();
      const frameBounds = this.drag.frame.getBoundingClientRect();
      const maxLeft = Math.max(0, stageBounds.width - frameBounds.width);
      const maxTop = Math.max(0, stageBounds.height - frameBounds.height);
      const left = this.drag.left + event.clientX - this.drag.startX;
      const top = this.drag.top + event.clientY - this.drag.startY;
      this.drag.frame.style.left = `${Math.max(0, Math.min(maxLeft, left))}px`;
      this.drag.frame.style.top = `${Math.max(0, Math.min(maxTop, top))}px`;
    };
    const finishDrag = (event) => {
      if (this.drag?.pointerId === event.pointerId) this.drag = null;
    };

    this.pointerHandlers = { pointerdown, pointermove, finishDrag };
    this.stage.addEventListener("pointerdown", pointerdown);
    this.stage.addEventListener("pointermove", pointermove);
    this.stage.addEventListener("pointerup", finishDrag);
    this.stage.addEventListener("pointercancel", finishDrag);
  }
}

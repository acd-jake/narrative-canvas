/**
 * Controller responsible for the Visual Novel character overlay layer.
 * Manages character DOM elements, smooth entry/exit animations,
 * and FLIP (First-Last-Invert-Play) gliding transitions when screen positions change.
 */
export class VisualNovelStage {
  #onActorOrderChange;
  /** @type {HTMLElement|null} */
  #stageElement = null;

  /** @type {HTMLElement|null} */
  #vnStage = null;

  /** @type {number|null} */
  #cleanupTimer = null;
  #pointerListenersController = null;
  #pointerDownActorId = null;
  #pointerId = null;
  #pointerStart = null;
  #isPointerDragging = false;
  #dropTargetActorId = null;
  #dropTargetSide = null;
  #dragGhostElement = null;
  #dragGhostOffset = null;

  constructor({ onActorOrderChange } = {}) {
    this.#onActorOrderChange = onActorOrderChange;
  }

  /**
   * Mounts the controller to the given canvas stage element.
   * @param {HTMLElement} stageElement
   */
  mount(stageElement) {
    this.#stageElement = stageElement;
    this.#vnStage = stageElement.querySelector(".narrative-visual-novel-stage");
    this.#pointerListenersController?.abort();
    this.#pointerListenersController = new AbortController();
    this.#vnStage?.addEventListener("pointerdown", this.#handlePointerDown, {
      signal: this.#pointerListenersController.signal
    });
    document.addEventListener("pointermove", this.#handlePointerMove, {
      signal: this.#pointerListenersController.signal
    });
    document.addEventListener("pointerup", this.#handlePointerUp, {
      signal: this.#pointerListenersController.signal
    });
    document.addEventListener("pointercancel", this.#handlePointerCancel, {
      signal: this.#pointerListenersController.signal
    });
  }

  /**
   * Updates the visual novel stage with new actors, animating entering/exiting
   * characters smoothly and gliding surviving characters to their new positions.
   * @param {object} context - Current canvas context with activeActors and activeSpeakerId
   */
  update(context = {}) {
    if (!this.#vnStage) {
      this.#vnStage = this.#stageElement?.querySelector(".narrative-visual-novel-stage");
    }
    if (!this.#vnStage) return;

    this.#vnStage.classList.toggle("has-speaker", Boolean(context.hasActiveSpeaker));
    this.#vnStage.classList.toggle("is-hidden-from-players", context.isVisualNovelOverlayVisible === false);
    const fadeDuration = context.fadeDuration ?? 500;

    const targetActors = context.activeActors || [];
    const targetMap = new Map(targetActors.map(a => [a.id, a]));

    // 1. Gather all currently rendered non-exiting character elements
    const activeCharEls = Array.from(
      this.#vnStage.querySelectorAll(".narrative-vn-character:not(.is-exiting)")
    );

    // FLIP - Step 1: FIRST (Record initial screen coordinates)
    const firstRects = new Map();
    for (const el of activeCharEls) {
      firstRects.set(el.dataset.actorId, el.getBoundingClientRect());
    }
    const stageRect = this.#vnStage.getBoundingClientRect();

    // 2. Identify exiting characters: animate smooth fade-out and slide-down
    for (const el of activeCharEls) {
      const actorId = el.dataset.actorId;
      if (!targetMap.has(actorId)) {
        this.#animateExit(el, firstRects.get(actorId), stageRect, fadeDuration);
      }
    }

    // 3. Update existing characters or create new entering characters
    const enteringElements = [];
    for (const actor of targetActors) {
      let charEl = this.#vnStage.querySelector(
        `.narrative-vn-character:not(.is-exiting)[data-actor-id="${actor.id}"]`
      );

      if (!charEl) {
        charEl = this.#createCharacterElement(actor);
        charEl.classList.add("is-entering");
        this.#vnStage.appendChild(charEl);
        enteringElements.push(charEl);
      } else {
        this.#updateCharacterElement(charEl, actor);
      }
      this.#bindReorderListeners(charEl, context.isGM === true);
    }

    for (const actor of targetActors) {
      const charEl = this.#vnStage.querySelector(
        `.narrative-vn-character:not(.is-exiting)[data-actor-id="${actor.id}"]`
      );
      if (charEl) this.#vnStage.appendChild(charEl);
    }

    // FLIP - Step 2: LAST (Record new screen coordinates of all in-flow characters)
    const inFlowElements = Array.from(
      this.#vnStage.querySelectorAll(".narrative-vn-character:not(.is-exiting)")
    );
    const lastRects = new Map();
    for (const el of inFlowElements) {
      lastRects.set(el.dataset.actorId, el.getBoundingClientRect());
    }

    // FLIP - Step 3: INVERT (Temporarily counter-translate surviving elements to their old positions)
    for (const el of inFlowElements) {
      const actorId = el.dataset.actorId;
      const first = firstRects.get(actorId);
      const last = lastRects.get(actorId);

      if (first && last) {
        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;

        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
          el.style.transition = "none";
          const isSpeaker = el.classList.contains("is-speaker");
          const baseTransform = isSpeaker ? "scale(1.05)" : "";
          el.style.transform = `translate(${deltaX}px, ${deltaY}px) ${baseTransform}`;
        }
      }
    }

    // Force layout flush so inversion styles register before transitions start
    void this.#vnStage.offsetHeight;

    // FLIP - Step 4: PLAY (Glide surviving elements to new positions and fade in entering elements)
    requestAnimationFrame(() => {
      for (const el of inFlowElements) {
        const isSpeaker = el.classList.contains("is-speaker");
        const isDimmed = this.#vnStage.classList.contains("has-speaker") && !isSpeaker;
        const baseTransform = isSpeaker ? "scale(1.05)" : "";

        el.style.transition = `transform ${fadeDuration}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ${fadeDuration}ms ease, filter ${fadeDuration}ms ease`;
        el.style.transform = baseTransform;
        el.style.opacity = isDimmed ? "0.78" : "1";

        if (el.classList.contains("is-entering")) {
          el.classList.remove("is-entering");
        }
      }
    });

    // Clean up temporary inline transitions after animation completes
    if (this.#cleanupTimer) clearTimeout(this.#cleanupTimer);
    this.#cleanupTimer = setTimeout(() => {
      for (const el of inFlowElements) {
        el.style.transition = "";
        if (!el.classList.contains("is-speaker")) {
          el.style.transform = "";
        }
      }
    }, fadeDuration);
  }

  /**
   * Animates a departing character out of the scene smoothly.
   * @private
   * @param {HTMLElement} el
   * @param {DOMRect} rect
   * @param {DOMRect} stageRect
   */
  #animateExit(el, rect, stageRect, fadeDuration) {
    if (!rect || !stageRect) {
      el.remove();
      return;
    }

    // Detach from flex flow to allow surviving actors to reposition, but fix absolute screen position
    const left = rect.left - stageRect.left;
    const top = rect.top - stageRect.top;

    el.classList.add("is-exiting");
    el.classList.remove("is-speaker");
    el.style.position = "absolute";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
    el.style.margin = "0";

    // Softly fade out and glide slightly downward
    requestAnimationFrame(() => {
      el.style.transition = `opacity ${fadeDuration}ms ease, transform ${fadeDuration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      el.style.opacity = "0";
      el.style.transform = "translateY(24px) scale(0.92)";
    });

    setTimeout(() => {
      if (el.parentNode === this.#vnStage) {
        el.remove();
      }
    }, fadeDuration);
  }

  /**
   * Constructs a new character DOM element.
   * @private
   * @param {object} actor
   * @returns {HTMLElement}
   */
  #createCharacterElement(actor) {
    const charEl = document.createElement("div");
    charEl.className = `narrative-vn-character ${actor.isSpeaker ? "is-speaker" : ""}`;
    charEl.id = `nc-vn-${actor.id}`;
    charEl.dataset.actorId = actor.id;

    const wrapper = document.createElement("div");
    wrapper.className = "narrative-vn-image-wrapper";

    const img = document.createElement("img");
    img.src = actor.img;
    img.alt = actor.name;
    img.className = "narrative-vn-image";
    wrapper.appendChild(img);

    if (actor.showName) {
      const namePlate = document.createElement("div");
      namePlate.className = "narrative-vn-name-plate";
      namePlate.innerHTML = `<span class="narrative-vn-name-text">${Handlebars.escapeExpression(actor.name)}</span>`;
      wrapper.appendChild(namePlate);
    }

    charEl.appendChild(wrapper);
    return charEl;
  }

  /**
   * Updates an existing character DOM element in-place.
   * @private
   * @param {HTMLElement} charEl
   * @param {object} actor
   */
  #updateCharacterElement(charEl, actor) {
    charEl.classList.toggle("is-speaker", Boolean(actor.isSpeaker));

    const imgWrapper = charEl.querySelector(".narrative-vn-image-wrapper");
    let namePlate = charEl.querySelector(".narrative-vn-name-plate");

    if (actor.showName) {
      if (!namePlate && imgWrapper) {
        namePlate = document.createElement("div");
        namePlate.className = "narrative-vn-name-plate";
        namePlate.innerHTML = `<span class="narrative-vn-name-text">${Handlebars.escapeExpression(actor.name)}</span>`;
        imgWrapper.appendChild(namePlate);
      } else if (namePlate) {
        const textEl = namePlate.querySelector(".narrative-vn-name-text");
        if (textEl) textEl.textContent = actor.name;
      }
    } else if (namePlate) {
      namePlate.remove();
    }
  }

  #bindReorderListeners(charEl, canReorder) {
    charEl.draggable = false;
    charEl.classList.toggle("is-reorderable", canReorder);
    const image = charEl.querySelector("img");
    if (image) image.draggable = false;
  }

  #handlePointerDown = event => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const actorElement = event.target.closest(".narrative-vn-character.is-reorderable");
    if (!actorElement || !this.#vnStage?.contains(actorElement)) return;

    this.#pointerDownActorId = actorElement.dataset.actorId;
    this.#pointerId = event.pointerId;
    this.#pointerStart = { x: event.clientX, y: event.clientY };
    const actorRect = actorElement.getBoundingClientRect();
    this.#dragGhostOffset = {
      x: event.clientX - actorRect.left,
      y: event.clientY - actorRect.top
    };
    this.#isPointerDragging = false;
  };

  #handlePointerMove = event => {
    if (event.pointerId !== this.#pointerId || !this.#pointerDownActorId || !this.#pointerStart) return;

    const deltaX = event.clientX - this.#pointerStart.x;
    const deltaY = event.clientY - this.#pointerStart.y;
    if (!this.#isPointerDragging && Math.hypot(deltaX, deltaY) < 6) return;

    if (!this.#isPointerDragging) this.#startDragGhost();
    this.#isPointerDragging = true;
    event.preventDefault();
    this.#updateDragGhost(event);

    const elementUnderPointer = document.elementFromPoint(event.clientX, event.clientY);
    const target = elementUnderPointer instanceof Element
      ? elementUnderPointer.closest(".narrative-vn-character.is-reorderable")
      : null;
    this.#vnStage?.querySelectorAll(".is-drop-target").forEach(element => {
      element.classList.remove("is-drop-target", "is-drop-before", "is-drop-after");
    });
    this.#dropTargetActorId = target && this.#vnStage?.contains(target) ? target.dataset.actorId : null;
    if (this.#dropTargetActorId && this.#dropTargetActorId !== this.#pointerDownActorId) {
      const targetRect = target.getBoundingClientRect();
      this.#dropTargetSide = event.clientX < targetRect.left + targetRect.width / 2 ? "before" : "after";
      target.classList.add("is-drop-target");
      target.classList.add(`is-drop-${this.#dropTargetSide}`);
    } else {
      this.#dropTargetActorId = null;
      this.#dropTargetSide = null;
    }
  };

  #handlePointerUp = event => {
    if (event.pointerId !== this.#pointerId || !this.#pointerDownActorId) return;

    if (this.#isPointerDragging && this.#dropTargetActorId
      && this.#dropTargetActorId !== this.#pointerDownActorId) {
      const actorIds = Array.from(
        this.#vnStage.querySelectorAll(".narrative-vn-character:not(.is-exiting)")
      ).map(element => element.dataset.actorId);
      const sourceIndex = actorIds.indexOf(this.#pointerDownActorId);
      const targetIndex = actorIds.indexOf(this.#dropTargetActorId);
      if (sourceIndex >= 0 && targetIndex >= 0) {
        actorIds.splice(sourceIndex, 1);
        const insertionIndex = targetIndex + (this.#dropTargetSide === "after" ? 1 : 0);
        actorIds.splice(insertionIndex, 0, this.#pointerDownActorId);
        this.#onActorOrderChange?.(actorIds);
      }
    }

    this.#resetPointerDragState();
  };

  #handlePointerCancel = event => {
    if (event.pointerId === this.#pointerId) this.#resetPointerDragState();
  };

  #resetPointerDragState() {
    this.#vnStage?.querySelectorAll(".is-dragging, .is-drop-target").forEach(element => {
      element.classList.remove("is-dragging", "is-drop-target", "is-drop-before", "is-drop-after");
    });
    this.#dragGhostElement?.remove();
    this.#dragGhostElement = null;
    this.#pointerDownActorId = null;
    this.#pointerId = null;
    this.#pointerStart = null;
    this.#isPointerDragging = false;
    this.#dropTargetActorId = null;
    this.#dropTargetSide = null;
    this.#dragGhostOffset = null;
  }

  #startDragGhost() {
    const source = this.#vnStage?.querySelector(
      `.narrative-vn-character[data-actor-id="${this.#pointerDownActorId}"]`
    );
    if (!source || !this.#stageElement) return;

    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true);
    ghost.classList.remove("is-reorderable", "is-entering", "is-speaker", "is-drop-target");
    ghost.classList.add("narrative-vn-drag-ghost");
    ghost.draggable = false;
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      maxWidth: "none",
      zIndex: "10001",
      opacity: "0.85",
      pointerEvents: "none",
      transform: "scale(0.96)",
      transition: "none"
    });
    this.#stageElement.appendChild(ghost);
    source.classList.add("is-dragging");
    this.#dragGhostElement = ghost;
  }

  #updateDragGhost(event) {
    if (!this.#dragGhostElement || !this.#dragGhostOffset) return;
    this.#dragGhostElement.style.left = `${event.clientX - this.#dragGhostOffset.x}px`;
    this.#dragGhostElement.style.top = `${event.clientY - this.#dragGhostOffset.y}px`;
  }

  /**
   * Destroys the visual novel stage controller and cleans up pending timers.
   */
  destroy() {
    this.#pointerListenersController?.abort();
    this.#pointerListenersController = null;
    this.#resetPointerDragState();
    if (this.#cleanupTimer) {
      clearTimeout(this.#cleanupTimer);
      this.#cleanupTimer = null;
    }
    this.#vnStage = null;
    this.#stageElement = null;
  }
}

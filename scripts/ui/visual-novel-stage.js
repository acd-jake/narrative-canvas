/**
 * Controller responsible for the Visual Novel character overlay layer.
 * Manages character DOM elements, smooth entry/exit animations,
 * and FLIP (First-Last-Invert-Play) gliding transitions when screen positions change.
 */
export class VisualNovelStage {
  /** @type {HTMLElement|null} */
  #stageElement = null;

  /** @type {HTMLElement|null} */
  #vnStage = null;

  /** @type {number|null} */
  #cleanupTimer = null;

  /**
   * Mounts the controller to the given canvas stage element.
   * @param {HTMLElement} stageElement
   */
  mount(stageElement) {
    this.#stageElement = stageElement;
    this.#vnStage = stageElement.querySelector(".narrative-visual-novel-stage");
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
        this.#animateExit(el, firstRects.get(actorId), stageRect);
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
          const baseTransform = isSpeaker ? "scale(1.05) translateY(-8px)" : "";
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
        const baseTransform = isSpeaker ? "scale(1.05) translateY(-8px)" : "";

        el.style.transition = "transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease, filter 0.3s ease";
        el.style.transform = baseTransform;
        el.style.opacity = "1";

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
    }, 550);
  }

  /**
   * Animates a departing character out of the scene smoothly.
   * @private
   * @param {HTMLElement} el
   * @param {DOMRect} rect
   * @param {DOMRect} stageRect
   */
  #animateExit(el, rect, stageRect) {
    if (!rect || !stageRect) {
      el.remove();
      return;
    }

    // Detach from flex flow to allow surviving actors to reposition, but fix absolute screen position
    const left = rect.left - stageRect.left;
    const top = rect.top - stageRect.top;

    el.classList.add("is-exiting");
    el.style.position = "absolute";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
    el.style.margin = "0";

    // Softly fade out and glide slightly downward
    requestAnimationFrame(() => {
      el.style.transition = "opacity 0.4s ease, transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)";
      el.style.opacity = "0";
      el.style.transform = "translateY(24px) scale(0.92)";
    });

    setTimeout(() => {
      if (el.parentNode === this.#vnStage) {
        el.remove();
      }
    }, 450);
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

  /**
   * Destroys the visual novel stage controller and cleans up pending timers.
   */
  destroy() {
    if (this.#cleanupTimer) {
      clearTimeout(this.#cleanupTimer);
      this.#cleanupTimer = null;
    }
    this.#vnStage = null;
    this.#stageElement = null;
  }
}

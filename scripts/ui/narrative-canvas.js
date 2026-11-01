import { NarrativeSettings } from "../services/settings.js";

/**
 * Abstract base class for raw DOM injection overlays, completely detached 
 * from Foundry's window-based Application framework.
 * @abstract
 */
export class NarrativeCanvas {
  /**
   * @param {string} id - The unique element ID to apply to the root node
   * @param {string} viewClass - Extra class to distinguish player and director views
   */
  constructor(id, viewClass) {
    if (this.constructor === NarrativeCanvas) {
      throw new TypeError("Abstract class 'NarrativeCanvas' cannot be instantiated directly.");
    }
    this.id = id;
    this.viewClass = viewClass;
    this.stageElement = null;
    this._resizeHandler = null;
    this._lastContext = null;
  }

  /**
   * Compiles the Handlebars template and inserts it directly into the DOM body root.
   * If already rendered, performs an in-place update when possible to prevent flickering.
   * @param {object} state - The full current narrative context module state
   */
  async render(state) {
    const activeActors = (state.activeActors || []).map(actor => ({
      ...actor,
      isSpeaker: actor.isSpeaker ?? (state.activeSpeakerId === actor.id),
      showName: actor.showName !== false
    }));

    const context = {
      ...state,
      activeActors,
      hasActiveSpeaker: Boolean(state.activeSpeakerId),
      isGM: game.user.isGM,
      customBgColor: NarrativeSettings.getBackgroundColor()
    };

    // If already rendered in DOM, check if we can update the stage in-place to prevent image flickering
    if (this._canUpdateInPlace(context)) {
      await this._updateInPlace(context);
      return;
    }

    // Full render / mount when scene, background, view, or overlays change
    const existingNode = document.getElementById(this.id);
    if (existingNode) existingNode.remove();

    const htmlString = await renderTemplate("modules/narrative-canvas/templates/main-display.hbs", context);

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newStage = doc.body.firstElementChild;

    newStage.id = this.id;
    newStage.classList.add("acd-nc", this.viewClass);
    newStage.style.setProperty("--nc-custom-bg", context.customBgColor || "#000000");

    if (context.background) {
      newStage.style.backgroundImage = `url('${context.background}')`;
    }

    await this._onPrepareElements(newStage, context);

    document.body.appendChild(newStage);
    this.stageElement = newStage;
    this._recordContext(context);
    document.body.classList.add("acd-nc-active");

    // Re-verify resize handler attachment
    if (!this._resizeHandler) {
      this._resizeHandler = this._handleWindowResize.bind(this);
      window.addEventListener("resize", this._resizeHandler);
    }
  }

  /**
   * Determines whether the visual novel stage can be updated in-place without rebuilding the canvas.
   * Only allowed when within the exact same scene, background, and UI state.
   * @protected
   * @param {object} context
   * @returns {boolean}
   */
  _canUpdateInPlace(context) {
    if (!this.stageElement || !this._lastContext) return false;
    const existingNode = document.getElementById(this.id);
    if (!existingNode || existingNode !== this.stageElement) return false;

    // Must be the exact same active scene
    if (context.activeSceneId !== this._lastContext.activeSceneId) return false;

    // Must have identical background
    if (context.background !== this._lastContext.background) return false;

    // Must have identical dialog, handout, visibility, and color
    if (context.customBgColor !== this._lastContext.customBgColor) return false;
    if (context.playerViewActive !== this._lastContext.playerViewActive) return false;
    if (context.handout !== this._lastContext.handout) return false;
    if (context.activeDialogue !== this._lastContext.activeDialogue) return false;

    return true;
  }

  /**
   * Stores scalar context properties to detect scene, background, or overlay changes.
   * @private
   */
  _recordContext(context) {
    this._lastContext = {
      activeSceneId: context.activeSceneId,
      background: context.background,
      customBgColor: context.customBgColor,
      playerViewActive: context.playerViewActive,
      handout: context.handout,
      activeDialogue: context.activeDialogue
    };
  }

  /**
   * Updates existing DOM elements in-place to avoid recreation and image flickering.
   * @protected
   * @param {object} context
   */
  async _updateInPlace(context) {
    const vnStage = this.stageElement?.querySelector(".narrative-visual-novel-stage");
    if (!vnStage) return;

    vnStage.classList.toggle("has-speaker", Boolean(context.hasActiveSpeaker));

    const targetActors = context.activeActors || [];
    const targetMap = new Map(targetActors.map(a => [a.id, a]));

    // 1. Remove characters no longer active on stage
    const renderedChars = Array.from(vnStage.querySelectorAll(".narrative-vn-character"));
    for (const charEl of renderedChars) {
      const actorId = charEl.dataset.actorId;
      if (!targetMap.has(actorId)) {
        charEl.remove();
      }
    }

    // 2. Add new characters or update existing ones in-place
    for (const actor of targetActors) {
      let charEl = vnStage.querySelector(`.narrative-vn-character[data-actor-id="${actor.id}"]`);
      if (!charEl) {
        charEl = document.createElement("div");
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
        vnStage.appendChild(charEl);
      } else {
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
    }

    await this._onUpdateElements(context);
    this._recordContext(context);
  }

  /**
   * Optional hook for subclasses to update child panels during in-place re-renders.
   * @protected
   * @param {object} context
   */
  async _onUpdateElements(context) {}

  /**
   * Abstract hook for subclasses to safely append interior template nodes.
   * @protected
   */
  async _onPrepareElements(stageElement, context) {}

  /**
   * Completely tears down the element tree from the document body root.
   */
  close() {
    document.body.classList.remove("acd-nc-active");

    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }

    const node = document.getElementById(this.id);
    if (node) node.remove();

    this.stageElement = null;
    this._lastContext = null;
  }

  /**
   * Ensures the raw container expands reactively across browser adjustments.
   * @private
   */
  _handleWindowResize() {
    if (!this.stageElement) return;
    this.stageElement.style.width = `${window.innerWidth}px`;
    this.stageElement.style.height = `${window.innerHeight}px`;
  }
}

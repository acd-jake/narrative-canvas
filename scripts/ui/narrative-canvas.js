import { NarrativeSettings } from "../services/settings.js";
import { StageBackgroundController } from "./stage-background.js";
import { VisualNovelStage } from "./visual-novel-stage.js";

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
    this.bgController = new StageBackgroundController();
    this.vnStageController = new VisualNovelStage();
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

    const defaultBg = NarrativeSettings.getDefaultBackgroundImage();
    const effectiveBackground = (state.background || defaultBg || "").trim();

    const context = {
      ...state,
      background: effectiveBackground,
      selectedBackground: state.background || "",
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

    // Initialize background controller and visual novel character layer
    this.bgController.mount(newStage, context.background);
    this.vnStageController.mount(newStage);

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
   * Determines whether the stage can be updated in-place without rebuilding the DOM.
   * Updating in-place avoids full re-renders and enables smooth transitions.
   * @protected
   * @param {object} context
   * @returns {boolean}
   */
  _canUpdateInPlace(context) {
    if (!this.stageElement || !this._lastContext) return false;
    const existingNode = document.getElementById(this.id);
    return Boolean(existingNode && existingNode === this.stageElement);
  }

  /**
   * Stores scalar context properties to detect changes.
   * @private
   */
  _recordContext(context) {
    this._lastContext = {
      activeSceneId: context.activeSceneId,
      background: context.background,
      selectedBackground: context.selectedBackground,
      customBgColor: context.customBgColor,
      playerViewActive: context.playerViewActive,
      handout: context.handout,
      imageOverlay: context.imageOverlay,
      activeDialogue: context.activeDialogue
    };
  }

  /**
   * Updates existing DOM elements in-place to avoid recreation and enable smooth animations.
   * @protected
   * @param {object} context
   */
  async _updateInPlace(context) {
    if (!this.stageElement) return;

    // 1. Smooth background crossfade
    this.bgController.update(context.background);

    // 2. Smooth visual novel characters FLIP & fade transitions
    this.vnStageController.update(context);

    // 3. Update background color variable
    this.stageElement.style.setProperty("--nc-custom-bg", context.customBgColor || "#000000");

    // 4. Update dialogue and handout layers in-place
    this._updateDialogueInPlace(context);
    this._updateHandoutInPlace(context);
    this._updateImageOverlayInPlace(context);

    // 5. Allow subclass to update its auxiliary panels (e.g. director controls, sidebar, carousel)
    await this._onUpdateElements(context);
    this._recordContext(context);
  }

  /**
   * Updates or mounts dialogue display in-place.
   * @private
   * @param {object} context
   */
  _updateDialogueInPlace(context) {
    if (!this.stageElement) return;
    const existingDialogue = this.stageElement.querySelector(".narrative-dialogue-stage");

    if (!context.activeDialogue) {
      if (existingDialogue) existingDialogue.remove();
      return;
    }

    if (!existingDialogue) {
      const div = document.createElement("div");
      div.className = "narrative-dialogue-stage animate-slide-up";
      div.innerHTML = `
        ${context.activeDialogue.portrait ? `<div class="narrative-speaker-portrait"><img src="${context.activeDialogue.portrait}" alt="${context.activeDialogue.speaker}"/></div>` : ""}
        <div class="narrative-speech-bubble">
          <h2 class="narrative-speaker-name">${Handlebars.escapeExpression(context.activeDialogue.speaker)}</h2>
          <p class="narrative-speech-text">${Handlebars.escapeExpression(context.activeDialogue.text)}</p>
        </div>
      `;
      this.stageElement.appendChild(div);
    } else {
      const portraitImg = existingDialogue.querySelector(".narrative-speaker-portrait img");
      if (portraitImg && context.activeDialogue.portrait) {
        portraitImg.src = context.activeDialogue.portrait;
      }
      const nameEl = existingDialogue.querySelector(".narrative-speaker-name");
      const textEl = existingDialogue.querySelector(".narrative-speech-text");
      if (nameEl) nameEl.textContent = context.activeDialogue.speaker;
      if (textEl) textEl.textContent = context.activeDialogue.text;
    }
  }

  /**
   * Updates or mounts handout display in-place.
   * @private
   * @param {object} context
   */
  _updateHandoutInPlace(context) {
    if (!this.stageElement) return;
    const existingHandout = this.stageElement.querySelector(".narrative-handout-container");

    if (!context.handout) {
      if (existingHandout) existingHandout.remove();
      return;
    }

    if (!existingHandout) {
      const div = document.createElement("div");
      div.className = "narrative-handout-container animate-fade-in";
      div.innerHTML = `
        <img src="${context.handout.src}" alt="${context.handout.title || ''}" class="narrative-handout-image"/>
        ${context.handout.title ? `<h3 class="narrative-handout-title">${Handlebars.escapeExpression(context.handout.title)}</h3>` : ""}
      `;
      this.stageElement.appendChild(div);
    } else {
      const img = existingHandout.querySelector(".narrative-handout-image");
      const title = existingHandout.querySelector(".narrative-handout-title");
      if (img) img.src = context.handout.src;
      if (title && context.handout.title) title.textContent = context.handout.title;
    }
  }

  _updateImageOverlayInPlace(context) {
    if (!this.stageElement) return;
    const existingOverlay = this.stageElement.querySelector(".narrative-image-overlay");

    if (!context.imageOverlay) {
      existingOverlay?.remove();
      return;
    }

    let overlay = existingOverlay;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "narrative-image-overlay animate-fade-in";
      overlay.innerHTML = `
        <div class="narrative-image-overlay-frame">
          <img class="narrative-image-overlay-image" />
          ${game.user.isGM ? `<button type="button" class="btn-close-image-overlay" title="${game.i18n.localize("NARRATIVE_CANVAS.Director.CloseImageOverlay")}" aria-label="${game.i18n.localize("NARRATIVE_CANVAS.Director.CloseImageOverlay")}"><i class="fas fa-times" aria-hidden="true"></i></button>` : ""}
        </div>
      `;
      this.stageElement.appendChild(overlay);
    }

    const image = overlay.querySelector(".narrative-image-overlay-image");
    if (image) {
      image.src = context.imageOverlay.src;
      image.alt = context.imageOverlay.title || "";
    }
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
    this.bgController.destroy();
    this.vnStageController.destroy();

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

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
    this._opacityAnimations = new WeakMap();
    this._imageOverlayTransitionId = 0;
    this._imageOverlayAnimation = null;
    this._imageOverlayAnimationTarget = null;
    this._imageOverlayAnimationElement = null;
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
    const activeBackground = state.currentSceneData?.backgrounds
      ?.find(background => background.path === state.background);
    const activeHandoutImage = state.currentSceneData?.handoutImages
      ?.find(image => image.path === state.handoutImage);
    const effectiveBackground = (state.background || defaultBg || "").trim();
    const enrichedBackgroundDescription = activeBackground?.showDescription === true
      ? await TextEditor.enrichHTML(activeBackground.description || "", {
          secrets: game.user.isGM,
          documents: true,
          links: true,
          rolls: true,
          embeds: true,
          async: true
        })
      : "";
    const enrichedHandoutDescription = activeHandoutImage?.showDescription === true
      ? await TextEditor.enrichHTML(activeHandoutImage.description || "", {
          secrets: game.user.isGM,
          documents: true,
          links: true,
          rolls: true,
          embeds: true,
          async: true
        })
      : "";

    const context = {
      ...state,
      background: effectiveBackground,
      selectedBackground: state.background || "",
      selectedHandoutImage: state.handoutImage || "",
      backgroundDescription: enrichedBackgroundDescription,
      handoutImageOverlay: activeHandoutImage && state.handoutImage
        ? {
            src: activeHandoutImage.path,
            title: activeHandoutImage.name || "",
            description: enrichedHandoutDescription
          }
        : null,
      activeActors,
      hasActiveSpeaker: Boolean(state.activeSpeakerId),
      isGM: game.user.isGM,
      customBgColor: NarrativeSettings.getBackgroundColor(),
      fadeDuration: NarrativeSettings.getFadeDuration()
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
    newStage.style.setProperty("--nc-fade-duration", `${context.fadeDuration}ms`);
    newStage.style.opacity = "0";

    // Initialize background controller and visual novel character layer
    this.bgController.mount(newStage, context.background);
    this.vnStageController.mount(newStage);

    await this._onPrepareElements(newStage, context);

    document.body.appendChild(newStage);
    this.stageElement = newStage;
    this._recordContext(context);
    document.body.style.setProperty("--nc-fade-duration", `${context.fadeDuration}ms`);
    document.body.classList.add("acd-nc-active");
    await this._animateElementOpacity(newStage, 1, context.fadeDuration);

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
      backgroundDescription: context.backgroundDescription,
      handoutImageOverlay: context.handoutImageOverlay,
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

    const fadeDuration = context.fadeDuration;
    this.stageElement.style.setProperty("--nc-fade-duration", `${fadeDuration}ms`);
    document.body.style.setProperty("--nc-fade-duration", `${fadeDuration}ms`);

    // 1. Update background and actor layers
    this.bgController.update(context.background, fadeDuration);
    this.vnStageController.update({ ...context, fadeDuration });
    this.#updateBackgroundDescription(context.backgroundDescription);
    this.#updateHandoutImageOverlay(context.handoutImageOverlay);

    // 2. Update background color variable
    this.stageElement.style.setProperty("--nc-custom-bg", context.customBgColor || "#000000");

    // 3. Update dialogue and handout layers in-place
    this._updateDialogueInPlace(context);
    this._updateHandoutInPlace(context);
    await this._updateImageOverlayInPlace(context);

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
      if (existingDialogue) this._fadeOutAndRemove(existingDialogue, context.fadeDuration);
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
      if (this._opacityAnimations.has(existingDialogue)) {
        this._animateElementOpacity(existingDialogue, 1, context.fadeDuration);
      }
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
      if (existingHandout) this._fadeOutAndRemove(existingHandout, context.fadeDuration);
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
      if (this._opacityAnimations.has(existingHandout)) {
        this._animateElementOpacity(existingHandout, 1, context.fadeDuration);
      }
    }
  }

  async _updateImageOverlayInPlace(context) {
    if (!this.stageElement) return;
    const transitionId = ++this._imageOverlayTransitionId;
    let overlay = this.stageElement.querySelector(".narrative-image-overlay");
    let isNewOverlay = false;

    if (!context.imageOverlay) {
      if (!overlay) return;
      await this._animateImageOverlayOpacity(overlay, 0, context.fadeDuration);
      if (transitionId === this._imageOverlayTransitionId) overlay.remove();
      return;
    }

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "narrative-image-overlay";
      overlay.style.opacity = "0";
      overlay.innerHTML = `
        <div class="narrative-image-overlay-frame">
          <img class="narrative-image-overlay-image" />
          ${game.user.isGM ? `<button type="button" class="btn-close-image-overlay" title="${game.i18n.localize("NARRATIVE_CANVAS.Director.CloseImageOverlay")}" aria-label="${game.i18n.localize("NARRATIVE_CANVAS.Director.CloseImageOverlay")}"><i class="fas fa-times" aria-hidden="true"></i></button>` : ""}
        </div>
      `;
      this.stageElement.appendChild(overlay);
      isNewOverlay = true;
    }

    const image = overlay.querySelector(".narrative-image-overlay-image");
    if (!image) return;

    const nextSource = context.imageOverlay.src;
    const currentSource = image.getAttribute("src");
    if (isNewOverlay) {
      image.src = nextSource;
    }
    image.alt = context.imageOverlay.title || "";

    if (currentSource !== nextSource) {
      const preloadedImage = new Image();
      preloadedImage.src = nextSource;
      if (typeof preloadedImage.decode === "function") {
        await preloadedImage.decode().catch(() => {});
      }
      if (transitionId !== this._imageOverlayTransitionId) return;

      if (!isNewOverlay) {
        await this._animateImageOverlayOpacity(overlay, 0, context.fadeDuration);
        if (transitionId !== this._imageOverlayTransitionId || !overlay.isConnected) return;

        image.src = nextSource;
        image.alt = context.imageOverlay.title || "";
      }
    }

    const opacity = Number.parseFloat(getComputedStyle(overlay).opacity);
    const isAnimating = this._imageOverlayAnimation?.playState === "running";
    if (isNewOverlay || currentSource !== nextSource || isAnimating || opacity < 1) {
      await this._animateImageOverlayOpacity(overlay, 1, context.fadeDuration);
    }
  }

  #updateBackgroundDescription(description) {
    let caption = this.stageElement.querySelector(".narrative-background-description");
    if (!description) {
      caption?.remove();
      return;
    }

    if (!caption) {
      caption = document.createElement("div");
      caption.className = "narrative-background-description animate-fade-in";
      this.stageElement.appendChild(caption);
    }
    caption.innerHTML = description;
  }

  #updateHandoutImageOverlay(background) {
    let overlay = this.stageElement.querySelector(".narrative-handout-image-overlay");
    if (!background) {
      overlay?.remove();
      return;
    }

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "narrative-handout-image-overlay animate-fade-in";
      overlay.innerHTML = `
        <div class="narrative-scene-handout-image-frame">
          <img class="narrative-scene-handout-image" />
          <div class="narrative-scene-handout-image-description"></div>
        </div>
      `;
      this.stageElement.appendChild(overlay);
    }

    const image = overlay.querySelector(".narrative-scene-handout-image");
    image.src = background.src;
    image.alt = background.title;
    const description = overlay.querySelector(".narrative-scene-handout-image-description");
    description.innerHTML = background.description || "";
    description.hidden = !background.description;
  }

  async _animateImageOverlayOpacity(overlay, targetOpacity, duration) {
    if (this._imageOverlayAnimation?.playState === "running"
      && this._imageOverlayAnimationTarget === targetOpacity
      && this._imageOverlayAnimationElement === overlay) {
      try {
        await this._imageOverlayAnimation.finished;
      } catch {}
      return;
    }

    const currentOpacity = Number.parseFloat(getComputedStyle(overlay).opacity);
    this._imageOverlayAnimation?.cancel();
    overlay.style.opacity = String(currentOpacity);

    const animation = overlay.animate(
      [{ opacity: currentOpacity }, { opacity: targetOpacity }],
      { duration, easing: "ease-in-out", fill: "forwards" }
    );
    this._imageOverlayAnimation = animation;
    this._imageOverlayAnimationTarget = targetOpacity;
    this._imageOverlayAnimationElement = overlay;

    try {
      await animation.finished;
    } catch {
      return;
    }

    if (this._imageOverlayAnimation !== animation) return;
    overlay.style.opacity = String(targetOpacity);
    animation.cancel();
    this._imageOverlayAnimation = null;
    this._imageOverlayAnimationTarget = null;
    this._imageOverlayAnimationElement = null;
  }

  /**
   * Optional hook for subclasses to update child panels during in-place re-renders.
   * @protected
   * @param {object} context
   */
  async _onUpdateElements(context) {}

  _fadeOutAndRemove(element, duration) {
    this._animateElementOpacity(element, 0, duration).then(completed => {
      if (completed && element.isConnected) element.remove();
    });
  }

  async _animateElementOpacity(element, targetOpacity, duration) {
    const currentOpacity = Number.parseFloat(getComputedStyle(element).opacity);
    this._opacityAnimations.get(element)?.cancel();
    element.style.opacity = String(currentOpacity);

    const animation = element.animate(
      [{ opacity: currentOpacity }, { opacity: targetOpacity }],
      { duration, easing: "ease-in-out", fill: "forwards" }
    );
    this._opacityAnimations.set(element, animation);

    try {
      await animation.finished;
    } catch {
      return false;
    }

    if (this._opacityAnimations.get(element) !== animation) return false;
    element.style.opacity = String(targetOpacity);
    animation.cancel();
    this._opacityAnimations.delete(element);
    return true;
  }

  /**
   * Abstract hook for subclasses to safely append interior template nodes.
   * @protected
   */
  async _onPrepareElements(stageElement, context) {}

  /**
   * Completely tears down the element tree from the document body root.
   */
  async close() {
    const closingStage = this.stageElement;
    this._imageOverlayTransitionId++;
    if (closingStage?.isConnected) {
      await this._animateElementOpacity(closingStage, 0, NarrativeSettings.getFadeDuration());
    }

    this._imageOverlayAnimation?.cancel();
    this._imageOverlayAnimation = null;
    this._imageOverlayAnimationTarget = null;
    this._imageOverlayAnimationElement = null;
    this.bgController.destroy();
    this.vnStageController.destroy();

    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }

    closingStage?.remove();

    if (!document.querySelector("#narrative-player-display, #narrative-canvas-director")) {
      document.body.classList.remove("acd-nc-active");
      document.body.style.removeProperty("--nc-fade-duration");
    }

    if (this.stageElement === closingStage) {
      this.stageElement = null;
      this._lastContext = null;
    }
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

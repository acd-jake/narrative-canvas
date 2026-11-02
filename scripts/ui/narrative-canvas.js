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
    this._backgroundDescriptionTransitionId = 0;
    this._handoutImageTransitionId = 0;
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
    const journalImage = state.journalImage;
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
    const handoutImageDescription = journalImage?.description
      ?? (activeHandoutImage?.showDescription === true ? activeHandoutImage.description : "");
    const enrichedHandoutDescription = handoutImageDescription
      ? await TextEditor.enrichHTML(handoutImageDescription, {
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
      handoutImageOverlay: journalImage
        ? {
            src: journalImage.src,
            title: journalImage.title || "",
            description: enrichedHandoutDescription
          }
        : activeHandoutImage && state.handoutImage
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
      journalImage: context.journalImage,
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
    await Promise.all([
      this.#updateBackgroundDescription(context.backgroundDescription, fadeDuration),
      this.#updateHandoutImageOverlay(context.handoutImageOverlay, fadeDuration)
    ]);

    // 2. Update background color variable
    this.stageElement.style.setProperty("--nc-custom-bg", context.customBgColor || "#000000");

    // 3. Update dialogue and handout layers in-place
    this._updateDialogueInPlace(context);
    this._updateHandoutInPlace(context);
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

  async #updateBackgroundDescription(description, duration) {
    const transitionId = ++this._backgroundDescriptionTransitionId;
    let caption = this.stageElement.querySelector(".narrative-background-description");
    const nextDescription = description || "";

    if (!description) {
      if (!caption) return;
      await this._animateElementOpacity(caption, 0, duration);
      if (transitionId === this._backgroundDescriptionTransitionId) caption.remove();
      return;
    }

    if (!caption) {
      caption = document.createElement("div");
      caption.className = "narrative-background-description";
      caption.style.opacity = "0";
      this.stageElement.appendChild(caption);
    }

    if (caption.innerHTML !== nextDescription) {
      if (caption.innerHTML) {
        await this._animateElementOpacity(caption, 0, duration);
        if (transitionId !== this._backgroundDescriptionTransitionId) return;
      }
      caption.innerHTML = nextDescription;
      await this._animateElementOpacity(caption, 1, duration);
    } else if (Number.parseFloat(getComputedStyle(caption).opacity) < 1) {
      await this._animateElementOpacity(caption, 1, duration);
    }
  }

  async #updateHandoutImageOverlay(background, duration) {
    const transitionId = ++this._handoutImageTransitionId;
    let overlay = this.stageElement.querySelector(".narrative-handout-image-overlay");
    if (!background) {
      if (!overlay) return;
      const visibleElements = [...overlay.querySelectorAll(
        ".narrative-scene-handout-image, .narrative-scene-handout-image-description"
      )]
        .filter(element => !element.hidden);
      const closeButton = overlay.querySelector(".btn-close-handout-image");
      if (closeButton) visibleElements.push(closeButton);
      await Promise.all(visibleElements.map(element => this._animateElementOpacity(element, 0, duration)));
      if (transitionId === this._handoutImageTransitionId) {
        overlay.remove();
        closeButton?.remove();
      }
      return;
    }

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "narrative-handout-image-overlay";
      overlay.innerHTML = `
        <div class="narrative-scene-handout-image-frame">
          <img class="narrative-scene-handout-image" />
          <div class="narrative-scene-handout-image-description"></div>
          ${game.user.isGM ? `<button type="button" class="btn-close-handout-image" title="${game.i18n.localize("NARRATIVE_CANVAS.Director.CloseImageOverlay")}" aria-label="${game.i18n.localize("NARRATIVE_CANVAS.Director.CloseImageOverlay")}"><i class="fas fa-times" aria-hidden="true"></i></button>` : ""}
        </div>
      `;
      this.stageElement.appendChild(overlay);
      overlay.querySelector(".narrative-scene-handout-image").style.opacity = "0";
      const description = overlay.querySelector(".narrative-scene-handout-image-description");
      description.style.opacity = "0";
      description.hidden = true;
    }

    const image = overlay.querySelector(".narrative-scene-handout-image");
    const currentSource = image.getAttribute("src") || "";
    if (currentSource !== background.src) {
      if (currentSource) {
        await this._animateElementOpacity(image, 0, duration);
        if (transitionId !== this._handoutImageTransitionId) return;
      }
      image.src = background.src;
      image.alt = background.title;
      if (typeof image.decode === "function") await image.decode().catch(() => {});
      if (transitionId !== this._handoutImageTransitionId) return;
      await this._animateElementOpacity(image, 1, duration);
    } else {
      image.alt = background.title;
    }

    const description = overlay.querySelector(".narrative-scene-handout-image-description");
    const nextDescription = background.description || "";
    if (description.innerHTML !== nextDescription) {
      if (description.innerHTML && !description.hidden) {
        await this._animateElementOpacity(description, 0, duration);
        if (transitionId !== this._handoutImageTransitionId) return;
      }
      description.innerHTML = nextDescription;
      description.hidden = !nextDescription;
      if (nextDescription) await this._animateElementOpacity(description, 1, duration);
    } else if (nextDescription && Number.parseFloat(getComputedStyle(description).opacity) < 1) {
      description.hidden = false;
      await this._animateElementOpacity(description, 1, duration);
    }
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
    this._backgroundDescriptionTransitionId++;
    this._handoutImageTransitionId++;
    if (closingStage?.isConnected) {
      await this._animateElementOpacity(closingStage, 0, NarrativeSettings.getFadeDuration());
    }

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

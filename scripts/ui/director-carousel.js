/**
 * Controller for the Director Actor Carousel displayed at the bottom of the Narrative Canvas.
 * Allows the GM to stage actors on the Visual Novel overlay, designate an active speaker,
 * toggle name visibility for players, and remove actors via button or right-click.
 */
export class DirectorActorCarousel {
  #callbacks;
  #element = null;
  #lastDataSourceId = "";

  /**
   * @param {object} callbacks
   * @param {(actorId: string) => void} callbacks.onActorStageToggle
   * @param {(actorId: string) => void} callbacks.onActorStageRemove
   * @param {(actorId: string) => void} callbacks.onActorSpeakerToggle
   * @param {(actorId: string) => void} callbacks.onActorToggleName
  * @param {() => void} callbacks.onActorStageClear
  * @param {() => void} callbacks.onVisualNovelOverlayVisibilityToggle
   */
  constructor(callbacks) {
    this.#callbacks = callbacks;
  }

  /**
   * Compiles the actor carousel template and attaches interactive event listeners.
   * If there are no actors in the current scene, returns null so the carousel is hidden.
   * @param {object} context - Module state and view context
   * @returns {Promise<HTMLElement|null>}
   */
  async render(context = {}) {
    const sceneActors = context.currentSceneData?.actors;
    if (!Array.isArray(sceneActors) || sceneActors.length === 0) {
      this.#element = null;
      return null;
    }

    const activeIds = new Set((context.activeActors || []).map(a => a.id));
    const activeSpeakerId = context.activeSpeakerId ?? null;
    const isVisualNovelOverlayVisible = context.isVisualNovelOverlayVisible !== false;

    const actors = sceneActors.map(actor => ({
      id: actor.id,
      name: actor.name,
      img: actor.img,
      showName: actor.showName !== false,
      isOnStage: activeIds.has(actor.id),
      isSpeaker: activeSpeakerId === actor.id
    }));

    const htmlString = await foundry.applications.handlebars.renderTemplate(
      "modules/narrative-canvas/templates/partials/director-actors.hbs",
      {
        actors,
        hasActiveActors: activeIds.size > 0,
        isVisualNovelOverlayVisible
      }
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;

    this.#element = newElement;
    this.#lastDataSourceId = context.currentSceneData?.id ?? context.activeSceneId ?? "";
    this.#bindListeners(this.#element);

    return newElement;
  }

  /**
   * Updates or re-renders the actor carousel within the stage element.
   * If the active scene changed, replaces the carousel with the new scene's actors.
   * If within the same scene, applies fast in-place card updates.
   * @param {HTMLElement} stageElement
   * @param {object} context
   */
  async update(stageElement, context = {}) {
    const sceneActors = context.currentSceneData?.actors;
    const hasActors = Array.isArray(sceneActors) && sceneActors.length > 0;

    if (!hasActors) {
      if (this.#element) {
        this.#element.remove();
        this.#element = null;
      }
      this.#lastDataSourceId = context.currentSceneData?.id ?? context.activeSceneId ?? "";
      return;
    }

    const dataSourceId = context.currentSceneData?.id ?? context.activeSceneId ?? "";

    // Re-render when the source changes or the carousel is not mounted.
    if (!this.#element || !stageElement.contains(this.#element) || this.#lastDataSourceId !== dataSourceId) {
      if (this.#element) this.#element.remove();
      const newEl = await this.render(context);
      if (newEl) {
        stageElement.appendChild(newEl);
      }
      this.#lastDataSourceId = dataSourceId;
      return;
    }

    // Fast in-place update of card states within the same scene
    this.updateInPlace(context);
    this.#lastDataSourceId = dataSourceId;
  }

  /**
   * Updates existing carousel card highlights and states in-place.
   * @param {object} context
   */
  updateInPlace(context = {}) {
    if (!this.#element) return;

    const activeIds = new Set((context.activeActors || []).map(a => a.id));
    const activeSpeakerId = context.activeSpeakerId ?? null;
    const sceneActors = context.currentSceneData?.actors || [];
    const isVisualNovelOverlayVisible = context.isVisualNovelOverlayVisible !== false;

    const visibilityButton = this.#element.querySelector(".btn-carousel-toggle-player-visibility");
    if (visibilityButton) {
      const labelKey = isVisualNovelOverlayVisible
        ? "NARRATIVE_CANVAS.Director.HideVisualNovelFromPlayers"
        : "NARRATIVE_CANVAS.Director.ShowVisualNovelToPlayers";
      const label = game.i18n.localize(labelKey);
      visibilityButton.classList.toggle("is-active", isVisualNovelOverlayVisible);
      visibilityButton.setAttribute("aria-pressed", String(isVisualNovelOverlayVisible));
      visibilityButton.title = label;
      visibilityButton.setAttribute("aria-label", label);
      visibilityButton.querySelector("i").className = `fas ${isVisualNovelOverlayVisible ? "fa-eye" : "fa-eye-slash"}`;
    }

    const clearButton = this.#element.querySelector(".btn-carousel-clear-stage");
    if (clearButton) clearButton.disabled = activeIds.size === 0;

    this.#element.querySelectorAll(".actor-carousel-card").forEach(card => {
      const actorId = card.dataset.actorId;
      const isOnStage = activeIds.has(actorId);
      const isSpeaker = activeSpeakerId === actorId;
      const sceneActor = sceneActors.find(a => a.id === actorId);
      const showName = sceneActor ? (sceneActor.showName !== false) : true;

      card.classList.toggle("is-on-stage", isOnStage);
      card.classList.toggle("is-active-speaker", isSpeaker);

      const speakerBtn = card.querySelector(".btn-carousel-toggle-speaker");
      if (speakerBtn) {
        speakerBtn.classList.toggle("is-active", isSpeaker);
        speakerBtn.title = isSpeaker
          ? game.i18n.localize("NARRATIVE_CANVAS.Director.RemoveSpeaker")
          : game.i18n.localize("NARRATIVE_CANVAS.Director.SetSpeaker");
      }

      const nameBtn = card.querySelector(".btn-carousel-toggle-name");
      if (nameBtn) {
        nameBtn.classList.toggle("is-active", showName);
        nameBtn.title = showName
          ? game.i18n.localize("NARRATIVE_CANVAS.Director.HideName")
          : game.i18n.localize("NARRATIVE_CANVAS.Director.ShowName");
        const icon = nameBtn.querySelector("i");
        if (icon) {
          icon.className = `fas ${showName ? "fa-id-badge" : "fa-eye-slash"}`;
        }
      }

      const removeBtn = card.querySelector(".btn-carousel-remove-stage");
      if (isOnStage && !removeBtn) {
        const thumbBox = card.querySelector(".actor-card-thumbnail-box");
        if (thumbBox) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn-carousel-action btn-carousel-remove-stage";
          btn.title = game.i18n.localize("NARRATIVE_CANVAS.Director.RemoveFromStage");
          btn.innerHTML = `<i class="fas fa-times"></i>`;
          btn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.#callbacks.onActorStageRemove?.(actorId);
          });
          thumbBox.appendChild(btn);
        }
      } else if (!isOnStage && removeBtn) {
        removeBtn.remove();
      }
    });
  }

  #bindListeners(element) {
    if (!element) return;

    element.querySelector(".btn-carousel-toggle-player-visibility")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.#callbacks.onVisualNovelOverlayVisibilityToggle?.();
    });

    element.querySelector(".btn-carousel-clear-stage")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.#callbacks.onActorStageClear?.();
    });

    // 1. Left-click to deploy or toggle actor on the visual novel stage
    element.querySelectorAll(".actor-carousel-card").forEach(card => {
      card.addEventListener("click", (event) => {
        if (event.target.closest(".btn-carousel-action")) return;
        const actorId = card.dataset.actorId;
        if (actorId) {
          this.#callbacks.onActorStageToggle?.(actorId);
        }
      });

      // 2. Right-click to remove actor from visual novel stage
      card.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actorId = card.dataset.actorId;
        if (actorId) {
          this.#callbacks.onActorStageRemove?.(actorId);
        }
      });
    });

    // 3. Action Button: Remove from Stage
    element.querySelectorAll(".btn-carousel-remove-stage").forEach(btn => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const card = btn.closest(".actor-carousel-card");
        const actorId = card?.dataset.actorId;
        if (actorId) {
          this.#callbacks.onActorStageRemove?.(actorId);
        }
      });
    });

    // 4. Action Button: Toggle Active Speaker
    element.querySelectorAll(".btn-carousel-toggle-speaker").forEach(btn => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const card = btn.closest(".actor-carousel-card");
        const actorId = card?.dataset.actorId;
        if (actorId) {
          this.#callbacks.onActorSpeakerToggle?.(actorId);
        }
      });
    });

    // 5. Action Button: Toggle Name Display
    element.querySelectorAll(".btn-carousel-toggle-name").forEach(btn => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const card = btn.closest(".actor-carousel-card");
        const actorId = card?.dataset.actorId;
        if (actorId) {
          this.#callbacks.onActorToggleName?.(actorId);
        }
      });
    });

    // 6. Navigation Controls: Scroll Left & Right
    const track = element.querySelector(".actors-carousel-track");
    if (track) {
      element.querySelector(".btn-carousel-scroll-left")?.addEventListener("click", (event) => {
        event.preventDefault();
        track.scrollBy({ left: -160, behavior: "smooth" });
      });

      element.querySelector(".btn-carousel-scroll-right")?.addEventListener("click", (event) => {
        event.preventDefault();
        track.scrollBy({ left: 160, behavior: "smooth" });
      });

      // Mouse wheel horizontal scroll support
      track.addEventListener("wheel", (event) => {
        if (event.deltaY !== 0) {
          event.preventDefault();
          track.scrollLeft += event.deltaY;
        }
      }, { passive: false });
    }
  }
}

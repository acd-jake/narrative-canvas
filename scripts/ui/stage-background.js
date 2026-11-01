/**
 * Controller responsible for managing background crossfade layers within the Narrative Canvas stage.
 * Provides smooth fade-in and fade-out transitions when the active background image changes.
 */
export class StageBackgroundController {
  /** @type {HTMLElement|null} */
  #container = null;

  /** @type {string} */
  #currentBackground = "";

  /** @type {HTMLElement|null} */
  #activeLayer = null;

  /**
   * Mounts the background controller to the canvas stage element.
   * Finds or creates a dedicated background container layer.
   * @param {HTMLElement} stageElement - The parent stage DOM element
   * @param {string} [initialBackground=""] - Initial background image URL
   */
  mount(stageElement, initialBackground = "") {
    let container = stageElement.querySelector(".narrative-bg-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "narrative-bg-container";
      stageElement.prepend(container);
    }

    this.#container = container;
    this.#currentBackground = (initialBackground || "").trim();
    this.#container.innerHTML = "";

    if (this.#currentBackground) {
      const layer = document.createElement("div");
      layer.className = "narrative-bg-layer is-active";
      layer.style.backgroundImage = `url('${this.#currentBackground}')`;
      this.#container.appendChild(layer);
      this.#activeLayer = layer;
    } else {
      this.#activeLayer = null;
    }
  }

  /**
   * Performs a smooth crossfade transition to the given background image.
   * - If unchanged, does nothing.
   * - If a new path is supplied, fades in a new layer and fades out previous layers.
   * - If an empty path is supplied, fades out the active layer to reveal the stage background.
   * @param {string} newBackground - Target background image URL or empty string
   */
  update(newBackground, fadeDuration = 800) {
    const nextPath = (newBackground || "").trim();
    if (nextPath === this.#currentBackground) return;

    if (!this.#container) return;

    const previousLayer = this.#activeLayer;

    if (nextPath) {
      const newLayer = document.createElement("div");
      newLayer.className = "narrative-bg-layer";
      newLayer.style.backgroundImage = `url('${nextPath}')`;
      this.#container.appendChild(newLayer);

      // Force layout calculation so initial opacity (0) takes effect before transition starts
      void newLayer.offsetHeight;

      newLayer.classList.add("is-active");
      this.#activeLayer = newLayer;

      if (previousLayer) {
        previousLayer.classList.remove("is-active");
        setTimeout(() => {
          if (previousLayer.parentNode === this.#container) {
            previousLayer.remove();
          }
        }, fadeDuration);
      }
    } else {
      if (previousLayer) {
        previousLayer.classList.remove("is-active");
        setTimeout(() => {
          if (previousLayer.parentNode === this.#container) {
            previousLayer.remove();
          }
        }, fadeDuration);
      }
      this.#activeLayer = null;
    }

    this.#currentBackground = nextPath;
  }

  /**
   * Cleans up the background container and resets internal state.
   */
  destroy() {
    if (this.#container) {
      this.#container.remove();
      this.#container = null;
    }
    this.#activeLayer = null;
    this.#currentBackground = "";
  }
}

import { ThemeCatalog } from "../services/themes/theme-catalog.js";

/**
 * Owns the director's canvas-level visibility and playback actions.
 */
export class DirectorCanvasToolbar {
  #callbacks;
  #element = null;

  /**
   * @param {object} callbacks
   * @param {(visible: boolean) => void} callbacks.onVisibilityChange
  * @param {() => void} callbacks.onCloseAllHandouts
  * @param {() => void} callbacks.onBackgroundReset
  * @param {(themeId: string) => void} callbacks.onThemeSelect
    * @param {() => void} callbacks.onReopenPlayers
    * @param {(muted: boolean) => void} callbacks.onAudioMuteChange
   * @param {() => void} callbacks.onShutdown
   * @param {() => Promise<void>} callbacks.onStopAllAudio
   */
  constructor(callbacks) {
    this.#callbacks = callbacks;
  }

  /**
   * Renders the canvas action toolbar.
   * @param {object} context
   * @returns {Promise<HTMLElement>}
   */
  async render(context = {}) {
    const htmlString = await foundry.applications.handlebars.renderTemplate(
      "modules/narrative-canvas/templates/partials/director-canvas-toolbar.hbs",
      this.#withThemeOptions(context)
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    this.#element = doc.body.firstElementChild;
    this.#element.addEventListener("click", event => this.#handleClick(event), true);
    return this.#element;
  }

  /**
   * Updates the visibility action without replacing the toolbar element.
   * @param {object} context
   */
  async updateInPlace(context = {}, container = null) {
    const toolbarElement = container?.querySelector(".narrative-canvas-toolbar")
      ?? (this.#element?.isConnected ? this.#element : null);
    if (!toolbarElement) return;

    const htmlString = await foundry.applications.handlebars.renderTemplate(
      "modules/narrative-canvas/templates/partials/director-canvas-toolbar.hbs",
      this.#withThemeOptions(context)
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;

    if (newElement) {
      toolbarElement.innerHTML = newElement.innerHTML;
      this.#element = toolbarElement;
    }
  }

  /**
   * Removes the toolbar and releases its DOM reference.
   */
  destroy() {
    this.#element?.remove();
    this.#element = null;
  }

  /** Adds the theme dropdown entries; "" stands for the module-setting default. */
  #withThemeOptions(context) {
    const selectedId = context.themeOverrideId ?? "";
    const themeOptions = [
      { id: "", label: "NARRATIVE_CANVAS.Director.ThemeModuleDefault" },
      ...ThemeCatalog.getEntries()
    ].map(({ id, label }) => ({ id, label: game.i18n.localize(label), selected: id === selectedId }));
    return { ...context, themeOptions };
  }

  async #handleClick(event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("button[data-canvas-action]");
    if (!(event.currentTarget instanceof Element) || !button || !event.currentTarget.contains(button)) return;

    event.preventDefault();
    event.stopPropagation();

    switch (button.dataset.canvasAction) {
      case "publish":
        this.#callbacks.onVisibilityChange(true);
        break;
      case "hide":
        this.#callbacks.onVisibilityChange(false);
        break;
      case "reopen-players":
        this.#callbacks.onReopenPlayers();
        break;
      case "toggle-audio-mute":
        this.#callbacks.onAudioMuteChange(button.dataset.audioMuted !== "true");
        break;
      case "stop-audio":
        await this.#callbacks.onStopAllAudio();
        break;
      case "close-handouts":
        this.#callbacks.onCloseAllHandouts();
        break;
      case "select-theme":
        this.#callbacks.onThemeSelect(button.dataset.themeId);
        break;
      case "reset-background":
        this.#callbacks.onBackgroundReset();
        break;
      case "shutdown":
        this.#callbacks.onShutdown();
        break;
    }
  }
}
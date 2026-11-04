/**
 * Context menu for the Journal Viewer that sends the selected text to the dialogue input.
 */
export class JournalSelectionMenu {
  #isEnabled;
  #onUseText;
  #menu = null;
  #closeController = null;

  /**
   * @param {object} options
   * @param {() => boolean} options.isEnabled
   * @param {(text: string) => void} options.onUseText
   */
  constructor({ isEnabled, onUseText }) {
    this.#isEnabled = isEnabled;
    this.#onUseText = onUseText;
  }

  /** @param {HTMLElement} root */
  mount(root) {
    root.addEventListener("contextmenu", event => {
      if (!(event.target instanceof Element) || !event.target.closest(".journal-page-body")) return;
      if (!this.#isEnabled()) return;

      const text = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
      if (!text) return;

      event.preventDefault();
      this.#open(event.clientX, event.clientY, text);
    });
  }

  close() {
    this.#closeController?.abort();
    this.#closeController = null;
    this.#menu?.remove();
    this.#menu = null;
  }

  #open(x, y, text) {
    this.close();

    const menu = document.createElement("div");
    menu.className = "nc-selection-menu";
    menu.setAttribute("role", "menu");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.innerHTML = `<i class="fas fa-comment-dots" aria-hidden="true"></i> ${
      Handlebars.escapeExpression(game.i18n.localize("NARRATIVE_CANVAS.Dialogue.UseSelection"))
    }`;
    // Keep the text selection alive while the menu is clicked.
    menu.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => {
      this.close();
      this.#onUseText(text);
    });
    menu.appendChild(button);
    document.body.appendChild(menu);

    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - width - 4))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - height - 4))}px`;
    this.#menu = menu;

    this.#closeController = new AbortController();
    const { signal } = this.#closeController;
    const closeOnOutside = event => {
      if (!menu.contains(event.target)) this.close();
    };
    document.addEventListener("pointerdown", closeOnOutside, { signal, capture: true });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") this.close();
    }, { signal });
    window.addEventListener("blur", () => this.close(), { signal });
    document.addEventListener("wheel", () => this.close(), { signal, passive: true });
  }
}

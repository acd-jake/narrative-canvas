import { NarrativeSettings } from "../services/settings.js";

/** Collapses runs of spaces but keeps line breaks (at most one blank line). */
function normalizeText(text) {
  return String(text ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Direct speech in German („…“, »…«), English (“…”, "…") and French («…») quotation marks. */
const QUOTE_PATTERN = /„[^„“”]{2,}?[“”]|“[^“”]{2,}”|"[^"]{2,}"|»[^»«]{2,}«|«[^«»]{2,}»/g;
const QUOTE_BUTTON_CLASS = "nc-quote-button";

/**
 * Journal Viewer helpers that send text to the dialogue input: a context menu for the
 * selected text, a button on each read-aloud block and a button behind direct speech.
 */
export class JournalSelectionMenu {
  #isEnabled;
  #onUseText;
  #menu = null;
  #closeController = null;
  #observer = null;
  #decorateFrame = null;

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
    this.#observer?.disconnect();
    this.#observer = new MutationObserver(() => {
      if (this.#decorateFrame !== null) return;
      this.#decorateFrame = requestAnimationFrame(() => {
        this.#decorateFrame = null;
        this.#decorateReadAloudBlocks(root);
        this.#decorateQuotes(root);
      });
    });
    this.#observer.observe(root, { childList: true, subtree: true });
    this.#decorateReadAloudBlocks(root);
    this.#decorateQuotes(root);

    root.addEventListener("click", event => {
      const quoteButton = event.target instanceof Element ? event.target.closest(`.${QUOTE_BUTTON_CLASS}`) : null;
      if (quoteButton) {
        event.preventDefault();
        event.stopPropagation();
        if (quoteButton.dataset.quote) this.#onUseText(quoteButton.dataset.quote);
        return;
      }

      const button = event.target instanceof Element ? event.target.closest(".nc-read-aloud-button") : null;
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      const text = normalizeText(button.parentElement?.innerText);
      if (text) this.#onUseText(text);
    });
    root.addEventListener("contextmenu", event => {
      if (!(event.target instanceof Element) || !event.target.closest(".journal-page-body")) return;
      if (!this.#isEnabled()) return;

      const text = normalizeText(window.getSelection()?.toString());
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

  #decorateReadAloudBlocks(root) {
    const className = NarrativeSettings.getReadAloudClass();
    if (!className) return;

    const label = game.i18n.localize("NARRATIVE_CANVAS.Dialogue.UseReadAloud");
    root.querySelectorAll(`.journal-page-body .${className}`).forEach(block => {
      if (block.querySelector(":scope > .nc-read-aloud-button")) return;

      block.classList.add("nc-read-aloud-target");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nc-read-aloud-button";
      button.title = label;
      button.setAttribute("aria-label", label);
      button.contentEditable = "false";
      button.innerHTML = `<i class="fas fa-comment-dots" aria-hidden="true"></i>`;
      block.appendChild(button);
    });
  }

  /** Adds a button behind each direct speech; CSS shows it only while the dialogue system is active. */
  #decorateQuotes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        const parent = node.parentElement;
        const accepted = parent?.closest(".journal-page-body")
          && !parent.closest(`button, script, style, .nc-read-aloud-target`);
        return accepted ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    const label = game.i18n.localize("NARRATIVE_CANVAS.Dialogue.UseQuote");
    for (const node of textNodes) {
      const matches = [...node.nodeValue.matchAll(QUOTE_PATTERN)].reverse();
      for (const match of matches) {
        const quote = match[0].slice(1, -1).trim();
        const end = match.index + match[0].length;
        const isDecorated = end === node.nodeValue.length
          && node.nextSibling?.classList?.contains(QUOTE_BUTTON_CLASS);
        if (!quote || isDecorated) continue;

        if (end < node.nodeValue.length) node.splitText(end);
        const button = document.createElement("button");
        button.type = "button";
        button.className = QUOTE_BUTTON_CLASS;
        button.dataset.quote = quote;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.contentEditable = "false";
        button.innerHTML = `<i class="fas fa-comment-dots" aria-hidden="true"></i>`;
        node.after(button);
      }
    }
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

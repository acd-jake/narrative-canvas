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

/** Text in parentheses directly before the given position, used as Talking Actors stage direction. */
function findPrecedingDirection(node, offset) {
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const block = element?.closest("p, li, blockquote, td, .journal-page-body");
  if (!block) return "";

  const range = document.createRange();
  try {
    range.setStart(block, 0);
    range.setEnd(node, offset);
  } catch {
    return "";
  }
  return range.toString().match(/\(([^()]+)\)[\s\u00a0:]*$/)?.[1].trim() ?? "";
}

/**
 * Journal Viewer helpers that send text to the dialogue input: a context menu for the
 * selected text, a button on each read-aloud block and a button behind direct speech.
 */
export class JournalSelectionMenu {
  #isEnabled;
  #isVoiceEnabled;
  #onUseText;
  #onSendNarration;
  #menu = null;
  #closeController = null;
  #observer = null;
  #decorateFrame = null;

  /**
   * @param {object} options
   * @param {() => boolean} options.isEnabled
   * @param {(text: string) => void} options.onUseText
   */
  constructor({ isEnabled, isVoiceEnabled, onUseText, onSendNarration }) {
    this.#isEnabled = isEnabled;
    this.#isVoiceEnabled = isVoiceEnabled;
    this.#onSendNarration = onSendNarration;
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
        if (quoteButton.dataset.quote) this.#onUseText(quoteButton.dataset.quote, quoteButton.dataset.direction || "");
        return;
      }

      const button = event.target instanceof Element ? event.target.closest(".nc-read-aloud-button") : null;
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      const text = normalizeText(button.parentElement?.innerText);
      if (!text) return;
      if (button.classList.contains("nc-read-aloud-send-button")) this.#onSendNarration?.(text);
      else this.#onUseText(text);
    });
    root.addEventListener("contextmenu", event => {
      if (!(event.target instanceof Element) || !event.target.closest(".journal-page-body")) return;

      // Keeps the document-level Talking Actors journal menu from opening in this viewer.
      event.stopPropagation();
      if (!this.#isEnabled()) return;

      const voiceButton = event.target.closest(`.${QUOTE_BUTTON_CLASS}, .nc-read-aloud-button`);
      if (voiceButton) {
        event.preventDefault();
        const text = voiceButton.dataset.quote ?? normalizeText(voiceButton.parentElement?.innerText);
        if (!text) return;
        const direction = this.#isVoiceEnabled?.() ? voiceButton.dataset.contextDirection || "" : "";
        this.#open(event.clientX, event.clientY, text, direction, !voiceButton.classList.contains(QUOTE_BUTTON_CLASS));
        return;
      }

      const text = normalizeText(window.getSelection()?.toString());
      if (!text) return;

      event.preventDefault();
      const range = window.getSelection().getRangeAt(0);
      const direction = this.#isVoiceEnabled?.()
        ? findPrecedingDirection(range.startContainer, range.startOffset)
        : "";
      this.#open(event.clientX, event.clientY, text, direction, true);
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

      const sendLabel = game.i18n.localize("NARRATIVE_CANVAS.Dialogue.SendReadAloudToNarration");
      const sendButton = button.cloneNode(false);
      sendButton.className = "nc-read-aloud-button nc-read-aloud-send-button";
      sendButton.title = sendLabel;
      sendButton.setAttribute("aria-label", sendLabel);
      sendButton.innerHTML = `<i class="fas fa-scroll" aria-hidden="true"></i>`;
      block.appendChild(sendButton);
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
    const directionLabel = game.i18n.localize("NARRATIVE_CANVAS.Dialogue.UseQuoteWithDirection");
    for (const node of textNodes) {
      const matches = [...node.nodeValue.matchAll(QUOTE_PATTERN)].reverse();
      for (const match of matches) {
        const quote = match[0].slice(1, -1).trim();
        const end = match.index + match[0].length;
        const isDecorated = end === node.nodeValue.length
          && node.nextSibling?.classList?.contains(QUOTE_BUTTON_CLASS);
        if (!quote || isDecorated) continue;

        const direction = findPrecedingDirection(node, match.index);
        if (end < node.nodeValue.length) node.splitText(end);
        const button = document.createElement("button");
        button.type = "button";
        button.className = QUOTE_BUTTON_CLASS;
        button.dataset.quote = quote;
        button.dataset.contextDirection = direction;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.contentEditable = "false";
        button.innerHTML = `<i class="fas fa-comment-dots" aria-hidden="true"></i>`;
        node.after(button);

        if (!direction) continue;
        const directionButton = button.cloneNode(true);
        directionButton.className = `${QUOTE_BUTTON_CLASS} nc-quote-direction-button`;
        directionButton.dataset.direction = direction;
        directionButton.title = `${directionLabel}: (${direction})`;
        directionButton.setAttribute("aria-label", directionLabel);
        directionButton.innerHTML = `<i class="fas fa-masks-theater" aria-hidden="true"></i>`;
        button.after(directionButton);
      }
    }
  }

  #open(x, y, text, direction = "", canNarrate = false) {
    this.close();

    const menu = document.createElement("div");
    menu.className = "nc-selection-menu";
    menu.setAttribute("role", "menu");
    const addItem = (icon, labelKey, onClick) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i> ${
        Handlebars.escapeExpression(game.i18n.localize(labelKey))
      }`;
      button.addEventListener("click", () => {
        this.close();
        onClick();
      });
      menu.appendChild(button);
    };
    addItem("fa-comment-dots", "NARRATIVE_CANVAS.Dialogue.UseSelection", () => this.#onUseText(text));
    if (direction) {
      addItem("fa-masks-theater", "NARRATIVE_CANVAS.Dialogue.UseSelectionWithDirection", () => this.#onUseText(text, direction));
    }
    if (canNarrate) addItem("fa-scroll", "NARRATIVE_CANVAS.Dialogue.SendToNarration", () => this.#onSendNarration?.(text));
    // Keep the text selection alive while the menu is clicked.
    menu.addEventListener("mousedown", event => event.preventDefault());
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

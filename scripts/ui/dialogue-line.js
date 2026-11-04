const HOLD_MS = 2200;
const FADE_OUT_MS = 700;
const CHAR_FADE_MS = 350;
const MAX_LINE_AGE_MS = 30000;

/**
 * Shows dialogue lines at the bottom of the canvas: characters fade in one by one,
 * the finished line stays visible briefly and then fades out as a whole.
 */
export class DialogueLineController {
  #stage = null;
  #element = null;
  #lastLineId = null;
  #timers = [];

  /**
   * @param {HTMLElement} stageElement
   * @param {object} context
   */
  update(stageElement, context = {}) {
    if (this.#stage !== stageElement) {
      this.#clearTimers();
      this.#stage = stageElement;
      this.#element = null;
    }

    const enabled = context.dialogueSystemEnabled === true;
    stageElement.classList.toggle("has-dialogue-system", enabled);

    if (!enabled) {
      this.#clearTimers();
      this.#element?.remove();
      this.#element = null;
      return;
    }

    if (!this.#element?.isConnected) this.#element = this.#createElement(stageElement);

    const line = context.dialogueLine;
    if (!line || line.id === this.#lastLineId) return;
    this.#lastLineId = line.id;
    if (Date.now() - (line.ts ?? 0) > MAX_LINE_AGE_MS) return;
    this.#play(line, context.isGM === true);
  }

  #createElement(stageElement) {
    const element = document.createElement("div");
    element.className = "narrative-dialogue-line";
    element.innerHTML = `<div class="narrative-dialogue-speaker"></div><div class="narrative-dialogue-text"></div>`;
    stageElement.appendChild(element);
    return element;
  }

  #clearTimers() {
    this.#timers.forEach(timer => clearTimeout(timer));
    this.#timers = [];
    this.#stage?.classList.remove("is-speaking");
  }

  #play(line, isGM) {
    this.#clearTimers();
    const element = this.#element;
    const speakerEl = element.querySelector(".narrative-dialogue-speaker");
    const textEl = element.querySelector(".narrative-dialogue-text");

    element.classList.remove("is-visible", "is-fading-out");
    element.classList.toggle("is-narration", line.isNarrator === true);
    textEl.replaceChildren();
    textEl.style.animation = "none";
    speakerEl.textContent = line.isNarrator ? "" : (line.speakerName ?? "");
    textEl.style.font = "";

    const { text, font } = this.#resolveText(line, isGM);
    if (font) textEl.style.font = font;

    if (line.isNarrator) {
      this.#playNarration(element, textEl, text);
      return;
    }

    const delay = 1000 / Math.max(1, Number(line.speed) || 40);
    let charIndex = 0;

    const words = text.split(/(\s+)/);
    for (const word of words) {
      if (!word) continue;
      if (/^\s+$/.test(word)) {
        textEl.appendChild(document.createTextNode(" "));
        continue;
      }
      const wordEl = document.createElement("span");
      wordEl.className = "narrative-dialogue-word";
      for (const char of word) {
        const charEl = document.createElement("span");
        charEl.className = "narrative-dialogue-char";
        charEl.textContent = char;
        charEl.style.animationDelay = `${Math.round(charIndex * delay)}ms`;
        wordEl.appendChild(charEl);
        charIndex++;
      }
      textEl.appendChild(wordEl);
    }

    // Restart the transition after the content swap.
    void element.offsetHeight;
    element.classList.add("is-visible");
    this.#stage?.classList.add("is-speaking");

    const revealMs = charIndex * delay + CHAR_FADE_MS;
    this.#timers.push(setTimeout(() => {
      element.classList.add("is-fading-out");
    }, revealMs + HOLD_MS));
    this.#timers.push(setTimeout(() => {
      element.classList.remove("is-visible", "is-fading-out");
      this.#stage?.classList.remove("is-speaking");
      textEl.replaceChildren();
    }, revealMs + HOLD_MS + FADE_OUT_MS));
  }

  /** Narration fades in as a whole; the longer the text, the slower the fade. */
  #playNarration(element, textEl, text) {
    const fadeInMs = Math.min(8000, Math.max(1200, text.length * 45));
    textEl.textContent = text;
    void textEl.offsetHeight;
    textEl.style.animation = `nc-dialogue-char-in ${fadeInMs}ms ease-in both`;
    element.classList.add("is-visible");

    this.#timers.push(setTimeout(() => {
      element.classList.add("is-fading-out");
    }, fadeInMs + HOLD_MS + text.length * 15));
    this.#timers.push(setTimeout(() => {
      element.classList.remove("is-visible", "is-fading-out");
      textEl.replaceChildren();
    }, fadeInMs + HOLD_MS + text.length * 15 + FADE_OUT_MS));
  }

  /** Scrambles the text for clients that do not know the line's Polyglot language. */
  #resolveText(line, isGM) {
    const language = line.language;
    const polyglot = game.modules.get("polyglot")?.active ? game.polyglot : null;
    if (!language || !polyglot || isGM) return { text: line.text, font: "" };

    try {
      const known = polyglot.isLanguageKnown(language);
      const understood = polyglot.isLanguageUnderstood(language);
      const unknown = !polyglot._isTruespeech(language) && !known && !understood;
      if (!unknown) return { text: line.text, font: "" };
      return {
        text: polyglot.scrambleString(line.text, line.id, language),
        font: polyglot._getFontStyle(language)
      };
    } catch {
      return { text: line.text, font: "" };
    }
  }
}

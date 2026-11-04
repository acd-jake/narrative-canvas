const HOLD_MS = 2200;
const FADE_OUT_MS = 700;
const CHAR_FADE_MS = 350;
const NARRATION_FADE_IN_MS = 1800;
const NARRATION_HOLD_BASE_MS = 2500;
const NARRATION_HOLD_PER_CHAR_MS = 50;
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
  #onDismiss;
  #isGM = false;

  /** @param {{onDismiss?: () => void}} [options] */
  constructor({ onDismiss } = {}) {
    this.#onDismiss = onDismiss;
  }

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
    this.#isGM = context.isGM === true;
    if (!line) return;
    if (line.id === this.#lastLineId) {
      if (line.dismissed) this.#dismiss();
      return;
    }
    this.#lastLineId = line.id;
    if (line.dismissed || Date.now() - (line.ts ?? 0) > MAX_LINE_AGE_MS) return;
    this.#play(line, context.isGM === true);
  }

  /** Starts the fade-out ahead of time. */
  #dismiss() {
    const element = this.#element;
    if (!element?.classList.contains("is-visible") || element.classList.contains("is-fading-out")) return;

    this.#clearTimers();
    element.classList.add("is-fading-out");
    this.#timers.push(setTimeout(() => {
      element.classList.remove("is-visible", "is-fading-out");
      element.querySelector(".narrative-dialogue-text")?.replaceChildren();
    }, FADE_OUT_MS));
  }

  #createElement(stageElement) {
    const element = document.createElement("div");
    element.className = "narrative-dialogue-line";
    element.innerHTML = `<div class="narrative-dialogue-speaker"></div><div class="narrative-dialogue-text"></div>`;
    stageElement.appendChild(element);
    element.addEventListener("click", () => {
      if (!this.#isGM) return;
      this.#dismiss();
      this.#onDismiss?.();
    });
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

    const words = text.split(/(\n|[^\S\n]+)/);
    for (const word of words) {
      if (!word) continue;
      if (word === "\n") {
        textEl.appendChild(document.createElement("br"));
        continue;
      }
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

  /** Narration fades in over a fixed time; the longer the text, the longer it stays fully visible. */
  #playNarration(element, textEl, text) {
    const holdMs = NARRATION_HOLD_BASE_MS + text.length * NARRATION_HOLD_PER_CHAR_MS;
    textEl.textContent = text;
    void textEl.offsetHeight;
    textEl.style.animation = `nc-dialogue-char-in ${NARRATION_FADE_IN_MS}ms ease-in both`;
    element.classList.add("is-visible");

    this.#timers.push(setTimeout(() => {
      element.classList.add("is-fading-out");
    }, NARRATION_FADE_IN_MS + holdMs));
    this.#timers.push(setTimeout(() => {
      element.classList.remove("is-visible", "is-fading-out");
      textEl.replaceChildren();
    }, NARRATION_FADE_IN_MS + holdMs + FADE_OUT_MS));
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

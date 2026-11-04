import { NarrativeSettings } from "../services/settings.js";

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
  #scrollFrame = null;
  #active = null;
  #onDismiss;
  #onBusyChange;
  #busy = false;
  #isGM = false;

  /** @param {{onDismiss?: () => void, onBusyChange?: (busy: boolean) => void}} [options] */
  constructor({ onDismiss, onBusyChange } = {}) {
    this.#onDismiss = onDismiss;
    this.#onBusyChange = onBusyChange;
  }

  /** True from the moment a line starts until it has completely faded out. */
  get isBusy() {
    return this.#busy;
  }

  #setBusy(busy) {
    if (this.#busy === busy) return;
    this.#busy = busy;
    this.#onBusyChange?.(busy);
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
      this.#setBusy(false);
    }

    const enabled = context.dialogueSystemEnabled === true;
    stageElement.classList.toggle("has-dialogue-system", enabled);

    if (!enabled) {
      this.#clearTimers();
      this.#element?.remove();
      this.#element = null;
      this.#setBusy(false);
      return;
    }

    if (!this.#element?.isConnected) this.#element = this.#createElement(stageElement);

    const line = context.dialogueLine;
    this.#isGM = context.isGM === true;
    if (!line) return;
    if (line.id === this.#lastLineId) {
      if (line.dismissed) this.#dismiss();
      else this.#retime(line);
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
      this.#setBusy(false);
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
    if (this.#scrollFrame !== null) cancelAnimationFrame(this.#scrollFrame);
    this.#scrollFrame = null;
    this.#stage?.classList.remove("is-speaking");
  }

  /** Scrolls linearly so the text reaches its end at endMs; scrollFactor speeds up the scroll. */
  #autoScroll(textEl, fillMs, endMs, scrollFactor) {
    const spanMs = Math.max(1, endMs - fillMs) / scrollFactor;
    this.#runScroll(textEl, Math.max(0, endMs - spanMs), endMs, 0);
  }

  /** Scrolls from fromTop to the end of the text; times are relative to now. */
  #runScroll(textEl, startMs, endMs, fromTop) {
    const distance = textEl.scrollHeight - textEl.clientHeight - fromTop;
    if (distance <= 1) return;

    const begin = performance.now();
    const step = now => {
      const elapsed = now - begin;
      const progress = Math.min(1, Math.max(0, (elapsed - startMs) / Math.max(1, endMs - startMs)));
      const eased = progress * progress * (3 - 2 * progress);
      textEl.scrollTop = fromTop + distance * eased;
      this.#scrollFrame = elapsed < endMs ? requestAnimationFrame(step) : null;
    };
    this.#scrollFrame = requestAnimationFrame(step);
  }

  #scheduleEnd(element, textEl, delayMs) {
    this.#timers.push(setTimeout(() => {
      element.classList.add("is-fading-out");
    }, delayMs));
    this.#timers.push(setTimeout(() => {
      element.classList.remove("is-visible", "is-fading-out");
      this.#stage?.classList.remove("is-speaking");
      textEl.replaceChildren();
      this.#setBusy(false);
    }, delayMs + FADE_OUT_MS));
  }

  /** Applies a changed speed multiplier to the line that is currently being shown. */
  #retime(line) {
    const active = this.#active;
    const element = this.#element;
    if (!active || active.id !== line.id || !element?.classList.contains("is-visible")
      || element.classList.contains("is-fading-out")) return;

    const factor = Math.min(
      NarrativeSettings.DIALOGUE_SPEED_MAX,
      Math.max(NarrativeSettings.DIALOGUE_SPEED_MIN, Number(line.speedFactor) || 1)
    );
    if (Math.abs(factor - active.factor) < 0.001) return;
    active.factor = factor;

    const rate = factor / active.baseFactor;
    const animations = active.textEl.getAnimations({ subtree: true });
    const elapsed = Math.min(active.revealMs, Math.max(0, ...animations.map(item => Number(item.currentTime) || 0)));
    animations.forEach(item => item.updatePlaybackRate(rate));
    const remainingMs = Math.max(0, (active.revealMs - elapsed) / rate);

    this.#clearTimers();
    if (!active.isNarrator) this.#stage?.classList.add("is-speaking");
    if (active.fillMs !== null) {
      this.#runScroll(active.textEl, Math.max(0, (active.fillMs - elapsed) / rate), remainingMs, active.textEl.scrollTop);
    }
    this.#scheduleEnd(element, active.textEl, remainingMs + active.holdMs);
  }

  /** Combines the module settings with the speed multiplier that was sent with the line. */
  #getTiming(line) {
    const factor = Math.min(
      NarrativeSettings.DIALOGUE_SPEED_MAX,
      Math.max(NarrativeSettings.DIALOGUE_SPEED_MIN, Number(line.speedFactor) || 1)
    );
    return {
      factor,
      charsPerSecond: NarrativeSettings.getDialogueNumber(NarrativeSettings.SETTING_DIALOGUE_REVEAL_SPEED) * factor,
      paragraphMs: NarrativeSettings.getDialogueNumber(NarrativeSettings.SETTING_NARRATION_PARAGRAPH_SECONDS) * 1000 / factor,
      scrollFactor: NarrativeSettings.getDialogueNumber(NarrativeSettings.SETTING_DIALOGUE_SCROLL_SPEED) / 100 * Math.sqrt(factor)
    };
  }

  #play(line, isGM) {
    this.#clearTimers();
    this.#active = null;
    this.#setBusy(true);
    const element = this.#element;
    const speakerEl = element.querySelector(".narrative-dialogue-speaker");
    const textEl = element.querySelector(".narrative-dialogue-text");

    element.classList.remove("is-visible", "is-fading-out");
    element.classList.toggle("is-narration", line.isNarrator === true);
    textEl.replaceChildren();
    textEl.scrollTop = 0;
    textEl.style.animation = "none";
    speakerEl.textContent = line.isNarrator ? "" : (line.speakerName ?? "");
    textEl.style.font = "";

    const { text, font } = this.#resolveText(line, isGM);
    if (font) textEl.style.font = font;

    const timing = this.#getTiming(line);
    if (line.isNarrator) {
      this.#playNarration(element, textEl, text, timing, line);
      return;
    }

    const delay = 1000 / Math.max(1, timing.charsPerSecond);
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
    // The box is full once that share of the text has been revealed.
    const fillMs = revealMs * (textEl.clientHeight / Math.max(1, textEl.scrollHeight));
    const overflows = textEl.scrollHeight - textEl.clientHeight > 1;
    this.#autoScroll(textEl, fillMs, revealMs, timing.scrollFactor);
    this.#active = {
      id: line.id,
      textEl,
      isNarrator: false,
      baseFactor: timing.factor,
      factor: timing.factor,
      revealMs,
      fillMs: overflows ? fillMs : null,
      holdMs: HOLD_MS
    };
    this.#scheduleEnd(element, textEl, revealMs + HOLD_MS);
  }

  /** Narration fades in paragraph by paragraph and holds for a base time plus a time per displayed line. */
  #playNarration(element, textEl, text, timing, line) {
    const paragraphs = text.split(/\n+/).map(part => part.trim()).filter(Boolean);
    for (const [index, paragraph] of paragraphs.entries()) {
      const paragraphEl = document.createElement("span");
      paragraphEl.className = "narrative-narration-paragraph";
      paragraphEl.textContent = paragraph;
      paragraphEl.style.animation = `nc-dialogue-char-in ${timing.paragraphMs}ms ease-in ${index * timing.paragraphMs}ms both`;
      textEl.appendChild(paragraphEl);
    }

    const revealMs = paragraphs.length * timing.paragraphMs;
    void textEl.offsetHeight;
    element.classList.add("is-visible");

    // Scrolling starts when the first paragraph that no longer fits begins to fade in.
    const overflowIndex = [...textEl.children].findIndex(
      child => child.offsetTop + child.offsetHeight > textEl.clientHeight
    );
    if (overflowIndex >= 0) this.#autoScroll(textEl, overflowIndex * timing.paragraphMs, revealMs, timing.scrollFactor);

    const lineHeight = Number.parseFloat(getComputedStyle(textEl).lineHeight)
      || Number.parseFloat(getComputedStyle(textEl).fontSize) * 1.35;
    const lines = Math.max(1, Math.round(textEl.scrollHeight / lineHeight));
    const holdMs = 1000 * (
      NarrativeSettings.getDialogueNumber(NarrativeSettings.SETTING_NARRATION_HOLD_BASE)
      + NarrativeSettings.getDialogueNumber(NarrativeSettings.SETTING_NARRATION_HOLD_PER_LINE) * lines
    );
    this.#active = {
      id: line.id,
      textEl,
      isNarrator: true,
      baseFactor: timing.factor,
      factor: timing.factor,
      revealMs,
      fillMs: overflowIndex >= 0 ? overflowIndex * timing.paragraphMs : null,
      holdMs
    };
    this.#scheduleEnd(element, textEl, revealMs + holdMs);
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

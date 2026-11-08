import { NarrativeSettings } from "../services/settings.js";
import { computeNarrationShiftFrames } from "./narration-layout.js";

const FADE_OUT_MS = 700;
const CHAR_FADE_MS = 350;
const MAX_LINE_AGE_MS = 30000;
const MIN_NARRATION_LINE_MS = 500;
// Pause after a paragraph, expressed as the number of characters it takes to read or write.
const NARRATION_PARAGRAPH_PAUSE_CHARS = 10;
const DIALOGUE_PARAGRAPH_PAUSE_CHARS = 20;
const MAX_NARRATION_FADE_MS = 1500;

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
  #shiftAnimation = null;
  #onDismiss;
  #onBusyChange;
  #onPausedChange;
  #busy = false;
  #paused = false;
  #pausedRemainingMs = 0;
  #pausedAnimations = [];
  #pendingPauseGroup = null;
  #lastNotifiedPaused = false;
  #pauseTimer = null;
  #endAt = 0;
  #isGM = false;

  /** @param {{onDismiss?: () => void, onBusyChange?: (busy: boolean) => void, onPausedChange?: (paused: boolean) => void}} [options] */
  constructor({ onDismiss, onBusyChange, onPausedChange } = {}) {
    this.#onDismiss = onDismiss;
    this.#onBusyChange = onBusyChange;
    this.#onPausedChange = onPausedChange;
  }

  /** True from the moment a line starts until it has completely faded out. */
  get isBusy() {
    return this.#busy;
  }

  /** True once a pause was requested, also while the current word or paragraph is still being shown. */
  get isPaused() {
    return this.#paused || this.#pendingPauseGroup !== null;
  }

  /**
   * Requests a pause at the end of the current word (character mode) or paragraph (line and paragraph mode).
   * @returns {number|null} The group to pause at, or null if no line can be paused.
   */
  requestPause() {
    const active = this.#active;
    const element = this.#element;
    if (this.isPaused || !active || !element?.classList.contains("is-visible")
      || element.classList.contains("is-fading-out")) return null;

    const elapsed = this.#elapsedMs();
    const started = active.words.filter(word => word.startMs <= elapsed + 1);
    const group = started.length ? started[started.length - 1].group : 0;
    this.#pendingPauseGroup = group;
    this.#notifyPaused();
    this.#armPause();
    return group;
  }

  #notifyPaused() {
    const paused = this.isPaused;
    if (paused === this.#lastNotifiedPaused) return;
    this.#lastNotifiedPaused = paused;
    this.#onPausedChange?.(paused);
  }

  #setBusy(busy) {
    if (!busy) {
      this.#pendingPauseGroup = null;
      this.#paused = false;
      this.#pausedAnimations = [];
      this.#notifyPaused();
    }
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
      else {
        this.#syncPause(line);
        if (!this.#paused) {
          this.#retime(line);
          this.#armPause();
        }
      }
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
      this.#resetShift();
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

  #resetShift() {
    this.#shiftAnimation?.cancel();
    this.#shiftAnimation = null;
  }

  #clearTimers() {
    this.#timers.forEach(timer => clearTimeout(timer));
    this.#timers = [];
    clearTimeout(this.#pauseTimer);
    this.#pauseTimer = null;
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
    this.#endAt = performance.now() + delayMs;
    this.#timers.push(setTimeout(() => {
      element.classList.add("is-fading-out");
    }, delayMs));
    this.#timers.push(setTimeout(() => {
      element.classList.remove("is-visible", "is-fading-out");
      this.#stage?.classList.remove("is-speaking");
      textEl.replaceChildren();
      this.#resetShift();
      this.#setBusy(false);
    }, delayMs + FADE_OUT_MS));
  }

  /** Follows the paused state of the line; a pause stops after the group the GM paused at. */
  #syncPause(line) {
    if (line.paused === true && !this.#paused) {
      const group = Number(line.pausedGroup);
      this.#pendingPauseGroup = Number.isFinite(group) ? group : 0;
      this.#notifyPaused();
      this.#armPause();
    } else if (line.paused !== true) {
      this.#pendingPauseGroup = null;
      clearTimeout(this.#pauseTimer);
      this.#pauseTimer = null;
      if (this.#paused) this.#resume();
      this.#notifyPaused();
    }
  }

  #elapsedMs() {
    const animations = this.#active?.textEl.getAnimations({ subtree: true }) ?? [];
    return Math.min(this.#active?.revealMs ?? 0, Math.max(0, ...animations.map(item => Number(item.currentTime) || 0)));
  }

  /** Keeps revealing until the pending pause group is fully shown, then pauses. */
  #armPause() {
    const active = this.#active;
    if (this.#pendingPauseGroup === null || !active || this.#paused) return;

    const group = this.#pendingPauseGroup;
    const ends = active.words.filter(word => word.group === group).map(word => word.endMs);
    const target = ends.length ? Math.max(...ends) : active.revealMs;
    const rate = active.factor / active.baseFactor;
    const delayMs = (target - this.#elapsedMs()) / rate;
    clearTimeout(this.#pauseTimer);
    if (delayMs <= 0) {
      this.#pause();
      return;
    }
    this.#pauseTimer = setTimeout(() => {
      this.#pauseTimer = null;
      this.#pause();
    }, delayMs);
  }

  /** Freezes reveal, scrolling and the end timer of the line that is being shown. */
  #pause() {
    const active = this.#active;
    const element = this.#element;
    if (!active || !element?.classList.contains("is-visible") || element.classList.contains("is-fading-out")) return;

    this.#paused = true;
    this.#pendingPauseGroup = null;
    this.#pausedRemainingMs = Math.max(0, this.#endAt - performance.now());
    this.#clearTimers();
    this.#pausedAnimations = active.textEl.getAnimations({ subtree: true }).filter(item => item.playState === "running");
    this.#pausedAnimations.forEach(item => item.pause());
    this.#notifyPaused();
  }

  #resume() {
    const active = this.#active;
    const element = this.#element;
    this.#paused = false;
    const animations = this.#pausedAnimations;
    this.#pausedAnimations = [];
    this.#notifyPaused();
    if (!active || !element?.isConnected) return;

    const elapsed = Math.min(active.revealMs, Math.max(0, ...animations.map(item => Number(item.currentTime) || 0)));
    animations.forEach(item => item.play());
    const rate = active.factor / active.baseFactor;
    const remainingMs = Math.max(0, (active.revealMs - elapsed) / rate);
    if (!active.isNarrator) this.#stage?.classList.add("is-speaking");
    if (active.fillMs !== null) {
      this.#runScroll(active.textEl, Math.max(0, (active.fillMs - elapsed) / rate), remainingMs, active.textEl.scrollTop);
    }
    this.#scheduleEnd(element, active.textEl, this.#pausedRemainingMs);
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
      charsPerSecond: NarrativeSettings.getDialogueNumber(NarrativeSettings.SETTING_NARRATION_READING_SPEED) * factor,
      scrollFactor: NarrativeSettings.getDialogueNumber(NarrativeSettings.SETTING_DIALOGUE_SCROLL_SPEED) / 100 * Math.sqrt(factor)
    };
  }

  #play(line, isGM) {
    this.#clearTimers();
    this.#pendingPauseGroup = null;
    this.#notifyPaused();
    this.#active = null;
    this.#resetShift();
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

    this.#playText(line, text, element, textEl, this.#getTiming(line));
  }

  /**
   * Reveals the text character by character, line by line or paragraph by paragraph (module setting).
   * Each unit takes as long as it takes to write or read it, with a short pause after each paragraph.
   */
  #playText(line, text, element, textEl, timing) {
    const isNarrator = line.isNarrator === true;
    const mode = NarrativeSettings.getRevealMode(isNarrator);
    const cps = Math.max(1, timing.charsPerSecond);
    const pauseMs = (isNarrator ? NARRATION_PARAGRAPH_PAUSE_CHARS : DIALOGUE_PARAGRAPH_PAUSE_CHARS) / cps * 1000;

    const words = [];
    const paragraphs = text.split(/\n+/).map(part => part.trim()).filter(Boolean);
    for (const [index, paragraph] of paragraphs.entries()) {
      if (index > 0) {
        if (isNarrator) {
          const gap = document.createElement("span");
          gap.className = "narrative-narration-gap";
          textEl.appendChild(gap);
        } else {
          textEl.appendChild(document.createElement("br"));
        }
      }
      for (const [wordIndex, word] of paragraph.split(/\s+/).entries()) {
        if (wordIndex > 0) textEl.appendChild(document.createTextNode(" "));
        const wordEl = document.createElement("span");
        wordEl.className = "narrative-dialogue-word";
        const chars = [];
        if (mode === "char") {
          for (const char of word) {
            const charEl = document.createElement("span");
            charEl.className = "narrative-dialogue-char";
            charEl.textContent = char;
            wordEl.appendChild(charEl);
            chars.push(charEl);
          }
        } else {
          wordEl.textContent = word;
        }
        textEl.appendChild(wordEl);
        words.push({ el: wordEl, chars, length: word.length, paragraph: index });
      }
    }

    // Group the words by the visual line they were laid out on.
    const rows = [];
    for (const word of words) {
      const top = word.el.offsetTop;
      const bottom = top + word.el.offsetHeight;
      const current = rows[rows.length - 1];
      if (current && Math.abs(top - current.top) < 3) {
        current.words.push(word);
        current.length += word.length + 1;
        current.bottom = Math.max(current.bottom, bottom);
      } else {
        rows.push({ top, bottom, words: [word], length: word.length, paragraph: word.paragraph });
      }
    }

    // Units that are revealed one after the other.
    let units;
    if (mode === "char") {
      units = rows.flatMap(row => row.words.flatMap(word => word.chars.map(el => (
        { els: [el], length: 1, paragraph: word.paragraph, bottom: row.bottom }
      ))));
    } else if (mode === "line") {
      units = rows.map(row => ({
        els: row.words.map(word => word.el), length: row.length, paragraph: row.paragraph, bottom: row.bottom
      }));
    } else {
      units = [];
      for (const row of rows) {
        const last = units[units.length - 1];
        if (last && last.paragraph === row.paragraph) {
          last.els.push(...row.words.map(word => word.el));
          last.length += row.length;
          last.bottom = Math.max(last.bottom, row.bottom);
        } else {
          units.push({
            els: row.words.map(word => word.el), length: row.length, paragraph: row.paragraph, bottom: row.bottom
          });
        }
      }
    }

    let startMs = 0;
    let revealMs = 0;
    const elementTimings = new Map();
    for (const [unitIndex, unit] of units.entries()) {
      const unitMs = mode === "char" ? 1000 / cps : Math.max(MIN_NARRATION_LINE_MS, unit.length / cps * 1000);
      const fadeMs = mode === "char" ? CHAR_FADE_MS : Math.min(MAX_NARRATION_FADE_MS, unitMs);
      unit.startMs = startMs;
      for (const el of unit.els) {
        el.style.animation = `nc-dialogue-char-in ${fadeMs}ms ease-in ${Math.round(startMs)}ms both`;
        elementTimings.set(el, { startMs, endMs: startMs + fadeMs });
      }
      revealMs = startMs + fadeMs;
      startMs += unitMs;
      if (units[unitIndex + 1] && units[unitIndex + 1].paragraph !== unit.paragraph) startMs += pauseMs;
    }

    // Restart the transition after the content swap.
    void textEl.offsetHeight;
    element.classList.add("is-visible");
    if (!isNarrator) this.#stage?.classList.add("is-speaking");

    // Scrolling starts when the first unit that no longer fits begins to appear.
    const overflowUnit = units.find(unit => unit.bottom > textEl.clientHeight);
    const fillMs = overflowUnit ? overflowUnit.startMs : null;
    if (fillMs !== null) this.#autoScroll(textEl, fillMs, revealMs, timing.scrollFactor);

    if (isNarrator && typeof textEl.animate === "function") {
      const frames = computeNarrationShiftFrames(units, textEl.clientHeight, revealMs);
      if (frames.length) {
        this.#shiftAnimation = textEl.animate(
          frames.map(frame => ({ offset: frame.offset, transform: `translateY(${frame.shift}px)` })),
          { duration: Math.max(1, revealMs), easing: "linear", fill: "both" }
        );
      }
    }

    // Only the lines that are visible in the box at the end count, not the whole text.
    const lastBottom = rows.length ? rows[rows.length - 1].bottom : 0;
    const visibleRows = rows.filter(row => row.top >= lastBottom - textEl.clientHeight - 1).length;
    const holdMs = 1000 * (
      NarrativeSettings.getDialogueNumber(NarrativeSettings.SETTING_NARRATION_HOLD_BASE)
      + NarrativeSettings.getDialogueNumber(NarrativeSettings.SETTING_NARRATION_HOLD_PER_LINE) * Math.max(1, visibleRows)
    );
    this.#active = {
      id: line.id,
      textEl,
      isNarrator,
      words: words.map((word, wordIndex) => {
        const items = (word.chars.length ? word.chars : [word.el]).map(el => elementTimings.get(el)).filter(Boolean);
        return {
          group: mode === "char" ? wordIndex : word.paragraph,
          startMs: items.length ? Math.min(...items.map(item => item.startMs)) : 0,
          endMs: items.length ? Math.max(...items.map(item => item.endMs)) : 0
        };
      }),
      baseFactor: timing.factor,
      factor: timing.factor,
      revealMs,
      fillMs,
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

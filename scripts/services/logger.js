import { NarrativeSettings } from "./settings.js";

const LOG_LEVELS = {
  off: -1,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

/** Shared level-filtered logger for Narrative Canvas services. */
export class NarrativeLogger {
  static error(...args) {
    this.#write("error", console.error, args);
  }

  static warn(...args) {
    this.#write("warn", console.warn, args);
  }

  static info(...args) {
    this.#write("info", console.info, args);
  }

  static debug(...args) {
    this.#write("debug", console.debug, args);
  }

  static trace(...args) {
    this.#write("trace", console.debug, args);
  }

  static #write(level, output, args) {
    const configuredLevel = NarrativeSettings.getLogLevel();
    const threshold = LOG_LEVELS[configuredLevel] ?? LOG_LEVELS.warn;
    if (LOG_LEVELS[level] > threshold) return;

    output.call(console, `[Narrative Canvas] ${level.toUpperCase()}:`, ...args);
  }
}
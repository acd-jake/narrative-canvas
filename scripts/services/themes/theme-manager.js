import { NarrativeLogger } from "../logger.js";
import { ThemeCatalog } from "./theme-catalog.js";
import { ThemeLoader } from "./theme-loader.js";
import { ThemeStyleMapper } from "./theme-style-mapper.js";

/** Holds the active theme and applies its styling to DOM elements. */
export class ThemeManager {
  static #cssVariables = {};
  static #appliedNames = new WeakMap();

  /**
   * Loads the given theme and makes it the active one.
   * Falls back to the default theme when the requested one is unavailable.
   * @param {string} themeId
   */
  static async activate(themeId) {
    const theme = await this.#loadWithFallback(themeId);
    this.#cssVariables = ThemeStyleMapper.toCssVariables(theme);
  }

  /**
   * Writes the active theme's CSS variables onto the element, replacing those of a previous theme.
   * @param {HTMLElement} element
   */
  static applyTo(element) {
    for (const name of this.#appliedNames.get(element) ?? []) {
      element.style.removeProperty(name);
    }
    for (const [name, value] of Object.entries(this.#cssVariables)) {
      element.style.setProperty(name, value);
    }
    this.#appliedNames.set(element, Object.keys(this.#cssVariables));
  }

  static async #loadWithFallback(themeId) {
    try {
      return await ThemeLoader.load(themeId);
    } catch (error) {
      NarrativeLogger.warn(`Falling back to theme "${ThemeCatalog.DEFAULT_THEME_ID}".`, error);
      return ThemeLoader.load(ThemeCatalog.DEFAULT_THEME_ID);
    }
  }
}

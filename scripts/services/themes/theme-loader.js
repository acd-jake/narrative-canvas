import { ThemeCatalog } from "./theme-catalog.js";

/** Fetches and caches theme definitions from their `theme.json` files. */
export class ThemeLoader {
  static #cache = new Map();

  /**
   * @param {string} themeId
   * @returns {Promise<{id: string, directory: string, definition: object}>}
   * @throws {Error} When the theme file cannot be fetched.
   */
  static async load(themeId) {
    if (this.#cache.has(themeId)) return this.#cache.get(themeId);

    const directory = ThemeCatalog.getDirectory(themeId);
    const response = await fetch(foundry.utils.getRoute(`${directory}/theme.json`));
    if (!response.ok) {
      throw new Error(`Theme "${themeId}" could not be loaded (HTTP ${response.status}).`);
    }

    const theme = { id: themeId, directory, definition: await response.json() };
    this.#cache.set(themeId, theme);
    return theme;
  }
}

const MODULE_ID = "narrative-canvas";

/** Lists the themes declared in the module manifest (`flags.narrative-canvas.themes`). */
export class ThemeCatalog {
  static DEFAULT_THEME_ID = "fantasy";

  /** @returns {{id: string, label: string}[]} */
  static getEntries() {
    return game.modules.get(MODULE_ID)?.flags?.[MODULE_ID]?.themes ?? [];
  }

  /** @returns {Record<string, string>} Theme id mapped to its localization key. */
  static getChoices() {
    return Object.fromEntries(this.getEntries().map(({ id, label }) => [id, label]));
  }

  /** @param {string} themeId */
  static has(themeId) {
    return this.getEntries().some(entry => entry.id === themeId);
  }

  /** @returns {string} Directory URL (relative to the server root) of the given theme. */
  static getDirectory(themeId) {
    return `modules/${MODULE_ID}/themes/${themeId}`;
  }
}

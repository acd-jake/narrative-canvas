const VARIABLE_PREFIX = "--nc-theme";
const IMAGE_KEY = "image";

/**
 * Translates a theme definition into CSS custom properties.
 * `{ subtitle: { frame: { slice: 32 } } }` becomes `--nc-theme-subtitle-frame-slice: 32`.
 * Values under the key `image` are file names relative to the theme directory.
 */
export class ThemeStyleMapper {
  /**
   * @param {{directory: string, definition: object}} theme
   * @returns {Record<string, string>}
   */
  static toCssVariables(theme) {
    const variables = {};
    this.#flatten(theme.definition.elements ?? {}, [VARIABLE_PREFIX], theme.directory, variables);
    return variables;
  }

  static #flatten(node, path, directory, variables) {
    for (const [key, value] of Object.entries(node)) {
      const childPath = [...path, this.#toKebabCase(key)];
      if (value !== null && typeof value === "object") {
        this.#flatten(value, childPath, directory, variables);
        continue;
      }
      variables[childPath.join("-")] = key === IMAGE_KEY ? this.#toCssUrl(directory, value) : String(value);
    }
  }

  static #toCssUrl(directory, fileName) {
    return `url("${foundry.utils.getRoute(`${directory}/${fileName}`)}")`;
  }

  static #toKebabCase(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  }
}

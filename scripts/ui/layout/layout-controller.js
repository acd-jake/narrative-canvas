/**
 * Base class of all layout strategies. A strategy turns a list of items into placements.
 * Returning `null` from `compute` means the strategy does not place items itself
 * (free handouts are placed by hand, the row layout is placed by CSS flex).
 */
export class LayoutController {
  /** Unique strategy id used in the settings. */
  static id = "";

  /** Localization key of the strategy name. */
  static labelKey = "";

  /** CSS class toggled on the stage while the strategy is active. */
  get cssClass() {
    return null;
  }

  /** True when the strategy leaves placement to the user or to CSS. */
  get isManual() {
    return true;
  }

  /**
   * @param {object[]} items
   * @param {{ width: number, height: number }} bounds
   * @param {object} options
   * @returns {object[]|null} One placement per item, in item order.
   */
  compute(items, bounds, options = {}) {
    return null;
  }
}

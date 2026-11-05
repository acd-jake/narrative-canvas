/**
 * Base class for game-system specific behavior. Subclass it, set `systemId`,
 * override what differs and register the class in system-registry.js.
 */
export class SystemAdapter {
  /** @type {string} Foundry system id this adapter belongs to; empty for the generic fallback. */
  static systemId = "";

  /** @returns {string} CSS class marking read-aloud blocks in journals; empty if the system has none. */
  get readAloudClass() {
    return "";
  }

  /** @returns {HTMLElement|null} The outer window element of an ApplicationV1 (jQuery) or V2 (HTMLElement) app. */
  getWindowElement(app) {
    const element = app?.element?.[0] ?? app?.element;
    return element?.closest?.(".application, .window-app") ?? element ?? null;
  }
}

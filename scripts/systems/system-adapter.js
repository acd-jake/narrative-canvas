export const RAISED_WINDOW_CLASS = "nc-raised-window";

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

  /** @returns {string[]} Render hook names of dialogs that must appear above the narrative canvas. */
  get raisedDialogHooks() {
    return [];
  }

  /** Registers the hooks this adapter needs; called once when the game is ready. */
  registerHooks() {
    for (const hookName of this.raisedDialogHooks) {
      Hooks.on(hookName, app => this.raiseWindow(app));
    }
  }

  /** Marks an application window so it is stacked above the narrative canvas. */
  raiseWindow(app) {
    this.getWindowElement(app)?.classList.add(RAISED_WINDOW_CLASS);
  }

  /** @returns {HTMLElement|null} The outer window element of an ApplicationV1 (jQuery) or V2 (HTMLElement) app. */
  getWindowElement(app) {
    const element = app?.element?.[0] ?? app?.element;
    return element?.closest?.(".application, .window-app") ?? element ?? null;
  }
}

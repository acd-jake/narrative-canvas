const DOCK_GAP = 8;

function isJournalSheet(app) {
  return app?.document?.documentName === "JournalEntry" && app.rendered;
}

/** The focused journal sheet, falling back to the top-most open one. */
function findActiveJournalSheet() {
  if (isJournalSheet(ui.activeWindow)) return ui.activeWindow;

  const zIndexOf = (app) => parseInt(app.element.style.zIndex) || 0;
  return [...foundry.applications.instances.values()]
    .filter(isJournalSheet)
    .sort((a, b) => zIndexOf(a) - zIndexOf(b))
    .pop() ?? null;
}

/**
 * Docks an application window to the right edge of the active journal sheet
 * and restores its free-floating position once that journal is closed.
 */
export class JournalDockController {
  #app;
  #onDocked;
  #onReleased;
  #journalId = null;
  #freePosition = null;
  #dockedWidth = null;
  #sheetObserver = null;
  #journalActivationHandler = null;

  /**
   * @param {ApplicationV2} app - The window to dock.
   * @param {object} callbacks
   * @param {(change: {journalId: string, previousJournalId: string|null}) => void} callbacks.onDocked
   * @param {() => void} callbacks.onReleased
   */
  constructor(app, { onDocked, onReleased }) {
    this.#app = app;
    this.#onDocked = onDocked;
    this.#onReleased = onReleased;
  }

  /** @returns {string|null} Id of the journal the window is docked to, if any. */
  get journalId() {
    return this.#journalId;
  }

  /** Subscribes to journal sheet lifecycle hooks. */
  register() {
    this.#journalActivationHandler = event => {
      if (!this.#app.rendered || !(event.target instanceof Node)) return;

      const sheet = [...foundry.applications.instances.values()].find(candidate =>
        isJournalSheet(candidate) && candidate.element?.contains(event.target)
      );
      if (!sheet) return;

      const previousJournalId = this.#journalId;
      this.#dockTo(sheet);
      if (sheet.document.id !== previousJournalId) this.#app.render();
    };
    document.addEventListener("pointerdown", this.#journalActivationHandler, true);
    document.addEventListener("focusin", this.#journalActivationHandler, true);

    Hooks.on("renderJournalEntrySheet", (sheet) => {
      if (!this.#app.rendered) return;
      this.#dockTo(sheet);
      this.#app.render();
    });

    Hooks.on("closeJournalEntrySheet", (sheet) => {
      if (!this.#app.rendered || sheet.document.id !== this.#journalId) return;
      this.release();
      this.#app.render();
    });
  }

  /** Docks to the currently active journal sheet; does nothing if none is open. */
  dockToActiveJournal() {
    const sheet = findActiveJournalSheet();
    if (sheet) this.#dockTo(sheet);
  }

  /** Returns the window to its last free-floating position. */
  release() {
    if (!this.#journalId) return;

    this.#journalId = null;
    this.#stopFollowing();
    if (this.#app.rendered) this.#app.setPosition(this.#freePosition);
    else Object.assign(this.#app.position, this.#freePosition);
    this.#freePosition = null;
    this.#dockedWidth = null;
    this.#onReleased();
  }

  #dockTo(sheet) {
    const previousJournalId = this.#journalId;
    const journalId = sheet.document.id;

    if (!previousJournalId) {
      const { left, top, width, height } = this.#app.position;
      this.#freePosition = { left, top, width, height };
      this.#dockedWidth = width;
    }
    this.#journalId = journalId;
    if (journalId !== previousJournalId) {
      this.#onDocked({ journalId, previousJournalId });
    }

    this.#alignTo(sheet);
    this.#follow(sheet);
  }

  #alignTo(sheet) {
    const bounds = sheet.element.getBoundingClientRect();
    const journalZIndex = Number.parseInt(getComputedStyle(sheet.element).zIndex, 10);
    this.#app.setPosition({
      left: bounds.right + DOCK_GAP,
      top: bounds.top,
      width: this.#dockedWidth ?? this.#app.position.width,
      height: bounds.height
    });
    if (Number.isFinite(journalZIndex)) {
      this.#app.element.style.zIndex = String(journalZIndex);
    }
  }

  /** Sheets write left/top/width/height to their inline style on every drag or resize. */
  #follow(sheet) {
    this.#stopFollowing();
    this.#sheetObserver = new MutationObserver(() => this.#alignTo(sheet));
    this.#sheetObserver.observe(sheet.element, { attributes: true, attributeFilter: ["style"] });
  }

  #stopFollowing() {
    this.#sheetObserver?.disconnect();
    this.#sheetObserver = null;
  }
}

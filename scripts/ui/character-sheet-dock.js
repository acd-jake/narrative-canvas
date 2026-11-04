const HIDE_DELAY_MS = 2000;
const SHEET_CLASS = "nc-char-sheet";

/**
 * Hover dock at the bottom-left of the canvas that shows character tokens
 * and toggles their character sheets. Lives on document.body, above the stage.
 */
export class CharacterSheetDock {
  constructor() {
    this.element = null;
    this._hideTimer = null;
    this._pointerInside = false;
    this._openActorId = null;
    this._hookIds = [];
  }

  mount() {
    this.destroy();
    this.element = document.createElement("div");
    this.element.className = "nc-char-dock-zone";
    this.element.innerHTML = `<div class="nc-char-dock"></div>`;
    this.element.addEventListener("mouseenter", () => {
      this._pointerInside = true;
      this._show();
    });
    this.element.addEventListener("mouseleave", () => {
      this._pointerInside = false;
      this._scheduleHide();
    });
    document.body.appendChild(this.element);

    const onClose = app => {
      if (app?.document?.id && app.document.id === this._openActorId) this._onSheetClosed();
    };
    for (const hook of ["closeApplicationV2", "closeApplication"]) {
      this._hookIds.push([hook, Hooks.on(hook, onClose)]);
    }
  }

  destroy() {
    clearTimeout(this._hideTimer);
    for (const [hook, id] of this._hookIds) Hooks.off(hook, id);
    this._hookIds = [];
    if (this._openActorId) game.actors.get(this._openActorId)?.sheet?.close();
    this._openActorId = null;
    this._pointerInside = false;
    this.element?.remove();
    this.element = null;
  }

  _getActors() {
    return game.actors.filter(actor =>
      actor.type === "character"
      && actor.hasPlayerOwner
      && (game.user.isGM || actor.isOwner)
    );
  }

  _renderTokens() {
    const dock = this.element.querySelector(".nc-char-dock");
    dock.replaceChildren();
    for (const actor of this._getActors()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nc-char-token";
      button.dataset.actorId = actor.id;
      button.title = actor.name;
      button.classList.toggle("is-active", actor.id === this._openActorId);
      const img = document.createElement("img");
      img.src = actor.prototypeToken?.texture?.src || actor.img;
      img.alt = actor.name;
      button.appendChild(img);
      button.addEventListener("click", () => this._toggleSheet(actor));
      dock.appendChild(button);
    }
  }

  _show() {
    clearTimeout(this._hideTimer);
    if (!this.element) return;
    if (!this.element.classList.contains("is-visible")) this._renderTokens();
    this.element.classList.add("is-visible");
  }

  _scheduleHide() {
    clearTimeout(this._hideTimer);
    if (this._openActorId || this._pointerInside) return;
    this._hideTimer = setTimeout(() => {
      if (!this._openActorId && !this._pointerInside) this.element?.classList.remove("is-visible");
    }, HIDE_DELAY_MS);
  }

  async _toggleSheet(actor) {
    if (this._openActorId === actor.id) {
      await actor.sheet.close();
      return;
    }
    if (this._openActorId) {
      const previousId = this._openActorId;
      this._openActorId = null;
      await game.actors.get(previousId)?.sheet?.close();
    }
    this._openActorId = actor.id;
    this._updateHighlight();
    await actor.sheet.render({ force: true });
    this._centerSheet(actor.sheet);
  }

  _centerSheet(sheet) {
    const element = sheet.element;
    if (!element) return;
    element.classList.add(SHEET_CLASS);
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    sheet.setPosition({
      left: Math.max(0, (window.innerWidth - width) / 2),
      top: Math.max(0, (window.innerHeight - height) / 2)
    });
  }

  _onSheetClosed() {
    this._openActorId = null;
    this._updateHighlight();
    this._scheduleHide();
  }

  _updateHighlight() {
    for (const button of this.element?.querySelectorAll(".nc-char-token") ?? []) {
      button.classList.toggle("is-active", button.dataset.actorId === this._openActorId);
    }
  }
}

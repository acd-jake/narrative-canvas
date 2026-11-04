const DISPLAY_MS = 8000;
const FADE_MS = 400;

/**
 * Temporarily shows the chat card of rolls while the canvas hides the chat.
 * Visibility follows the message's roll mode via isContentVisible.
 */
export class RollToast {
  constructor() {
    this._hookId = null;
    this._container = null;
  }

  mount() {
    this.destroy();
    this._container = document.createElement("div");
    this._container.className = "nc-roll-toasts";
    document.body.appendChild(this._container);
    this._hookId = Hooks.on("createChatMessage", message => this._onMessage(message));
  }

  destroy() {
    if (this._hookId !== null) Hooks.off("createChatMessage", this._hookId);
    this._hookId = null;
    this._container?.remove();
    this._container = null;
  }

  async _onMessage(message) {
    if (!message.isRoll || !message.rolls?.length) return;
    if (!message.speaker?.actor || !message.isContentVisible) return;

    // Dice So Nice hides roll cards until its animation ends and only unhides them inside the chat log.
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message.id);
    const card = await message.renderHTML();
    if (!this._container) return;
    card.hidden = false;
    card.style.removeProperty("display");

    const toast = document.createElement("div");
    toast.className = "nc-roll-toast";
    toast.appendChild(card);
    this._container.appendChild(toast);
    this._scheduleRemoval(toast);
  }

  _scheduleRemoval(toast) {
    let timer;
    const start = () => {
      timer = setTimeout(() => {
        toast.classList.add("is-leaving");
        setTimeout(() => toast.remove(), FADE_MS);
      }, DISPLAY_MS);
    };
    toast.addEventListener("mouseenter", () => clearTimeout(timer));
    toast.addEventListener("mouseleave", start);
    start();
  }
}

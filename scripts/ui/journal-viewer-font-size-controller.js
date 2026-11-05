export class JournalViewerFontSizeController {
  #fontSize = 0.85;
  #minFontSize = 0.65;
  #maxFontSize = 1.5;
  #step = 0.1;
  #boundRoot = null;

  static controlsHtml() {
    const decrease = game.i18n.localize("NARRATIVE_CANVAS.Director.DecreaseJournalFontSize");
    const increase = game.i18n.localize("NARRATIVE_CANVAS.Director.IncreaseJournalFontSize");
    return `
      <div class="journal-font-size-controls">
        <button type="button" data-font-size-change="-1" title="${decrease}" aria-label="${decrease}"><i class="fas fa-minus" aria-hidden="true"></i></button>
        <button type="button" data-font-size-change="1" title="${increase}" aria-label="${increase}"><i class="fas fa-plus" aria-hidden="true"></i></button>
      </div>`;
  }

  mount(root) {
    if (this.#boundRoot !== root) {
      this.#boundRoot = root;
      root.addEventListener("click", event => {
        const button = event.target.closest(".journal-font-size-controls [data-font-size-change]");
        if (!button) return;

        event.preventDefault();
        this.#change(Number(button.dataset.fontSizeChange), root);
      });
    }

    this.apply(root);
  }

  #change(change, root) {
    this.#fontSize = Math.min(
      this.#maxFontSize,
      Math.max(this.#minFontSize, Math.round((this.#fontSize + change * this.#step) * 100) / 100)
    );
    this.apply(root);
  }

  apply(root) {
    const pageBody = root.querySelector(".journal-page-body");
    if (pageBody) pageBody.style.fontSize = `${this.#fontSize}rem`;

    const decreaseButton = root.querySelector('[data-font-size-change="-1"]');
    const increaseButton = root.querySelector('[data-font-size-change="1"]');
    if (decreaseButton) decreaseButton.disabled = this.#fontSize <= this.#minFontSize;
    if (increaseButton) increaseButton.disabled = this.#fontSize >= this.#maxFontSize;
  }
}
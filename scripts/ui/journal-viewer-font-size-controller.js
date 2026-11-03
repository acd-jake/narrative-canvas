export class JournalViewerFontSizeController {
  #fontSize = 0.85;
  #minFontSize = 0.65;
  #maxFontSize = 1.5;
  #step = 0.1;

  mount(root) {
    root.querySelector(".journal-font-size-controls")?.addEventListener("click", event => {
      const button = event.target.closest("[data-font-size-change]");
      if (!button) return;

      event.preventDefault();
      this.#change(Number(button.dataset.fontSizeChange), root);
    });

    this.#apply(root);
  }

  #change(change, root) {
    this.#fontSize = Math.min(
      this.#maxFontSize,
      Math.max(this.#minFontSize, Math.round((this.#fontSize + change * this.#step) * 100) / 100)
    );
    this.#apply(root);
  }

  #apply(root) {
    const pageBody = root.querySelector(".journal-page-body");
    if (pageBody) pageBody.style.fontSize = `${this.#fontSize}rem`;

    const decreaseButton = root.querySelector('[data-font-size-change="-1"]');
    const increaseButton = root.querySelector('[data-font-size-change="1"]');
    if (decreaseButton) decreaseButton.disabled = this.#fontSize <= this.#minFontSize;
    if (increaseButton) increaseButton.disabled = this.#fontSize >= this.#maxFontSize;
  }
}
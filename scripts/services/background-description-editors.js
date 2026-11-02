/** Manages Foundry ProseMirror elements and debounced persistence for scene image descriptions. */
export class SceneImageDescriptionEditors {
  #editors = new Set();
  #onSave;

  constructor(onSave) {
    this.#onSave = onSave;
  }

  async mount(root) {
    await this.destroy();

    const targets = root.querySelectorAll(".background-description-editor");
    for (const element of targets) {
      const entry = {
        element,
        sceneId: element.dataset.sceneId,
        collectionName: element.dataset.imageCollection,
        index: Number(element.dataset.imageIndex),
        timer: null,
        savedHTML: element.value,
        saving: null,
        abortController: new AbortController()
      };

      element.addEventListener("save", () => this.#persist(entry), { signal: entry.abortController.signal });
      element.addEventListener("input", () => this.#scheduleSave(entry), { signal: entry.abortController.signal });
      this.#editors.add(entry);
    }
  }

  async saveAll() {
    await Promise.all([...this.#editors].map(async entry => {
      clearTimeout(entry.timer);
      entry.element.save();
      if (entry.saving) await entry.saving;
    }));
  }

  focus(sceneId, collectionName, index) {
    const entry = [...this.#editors].find(candidate => candidate.sceneId === sceneId
      && candidate.collectionName === collectionName
      && candidate.index === index);
    entry?.element.focus();
  }

  async destroy() {
    await this.saveAll();
    for (const entry of this.#editors) {
      clearTimeout(entry.timer);
      entry.abortController.abort();
    }
    this.#editors.clear();
  }

  #scheduleSave(entry) {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => entry.element.save(), 700);
  }

  async #persist(entry) {
    const description = entry.element.value;
    if (description === entry.savedHTML) return;
    if (entry.saving) {
      await entry.saving;
      if (entry.element.value === entry.savedHTML) return;
    }

    entry.saving = this.#onSave(entry.sceneId, entry.collectionName, entry.index, description);
    try {
      await entry.saving;
      entry.savedHTML = description;
    } catch (error) {
      console.error("Narrative Canvas | Failed to save image description:", error);
    } finally {
      entry.saving = null;
    }

    if (entry.element.value !== entry.savedHTML) {
      entry.element.save();
    }
  }
}
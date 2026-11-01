import { NarrativeSettings } from "./settings.js";

/**
 * Persistence gateway for narrative scenes.
 * Every mutation reads the stored scenes, applies one change and saves the result.
 */
export class NarrativeSceneRepository {
  /** @returns {object[]} All stored scenes. */
  static getAll() {
    return NarrativeSettings.getAllScenes();
  }

  /**
   * @param {string|null} journalId - Restricts the result to this journal's scenes when set.
   * @returns {object[]}
   */
  static getVisible(journalId = null) {
    const scenes = this.getAll();
    return journalId ? scenes.filter(scene => scene.journalId === journalId) : scenes;
  }

  /**
   * @param {{name: string, journalId?: string|null}} options
   * @returns {Promise<object>} The created scene.
   */
  static async create({ name, journalId = null }) {
    const scenes = this.getAll();
    const scene = {
      id: `scene-${foundry.utils.randomID()}`,
      name: this.#toUniqueName(name, scenes),
      backgrounds: [],
      actors: [],
      tracks: []
    };
    if (journalId) {
      scene.journalId = journalId;
      scene.journalName = game.collections.get("JournalEntry").get(journalId)?.name;
    }

    await NarrativeSettings.saveAllScenes([...scenes, scene]);
    return scene;
  }

  static async remove(sceneId) {
    await NarrativeSettings.saveAllScenes(this.getAll().filter(scene => scene.id !== sceneId));
  }

  static async rename(sceneId, name) {
    await this.#update(sceneId, (scene, scenes) => {
      scene.name = this.#toUniqueName(name, scenes, sceneId);
    });
  }

  static async addBackground(sceneId, path) {
    await this.#update(sceneId, scene => {
      scene.backgrounds.push({ name: path.split("/").pop(), path });
    });
  }

  static async addActor(sceneId, actor) {
    await this.#update(sceneId, scene => {
      if (!scene.actors.some(existing => existing.id === actor.id)) scene.actors.push(actor);
    });
  }

  static async addTrack(sceneId, track) {
    await this.#update(sceneId, scene => { scene.tracks.push(track); });
  }

  static async removeBackground(sceneId, index) {
    await this.#update(sceneId, scene => { scene.backgrounds.splice(index, 1); });
  }

  static async removeActor(sceneId, actorId) {
    await this.#update(sceneId, scene => {
      scene.actors = scene.actors.filter(actor => actor.id !== actorId);
    });
  }

  static async removeTrack(sceneId, trackId) {
    await this.#update(sceneId, scene => {
      scene.tracks = scene.tracks.filter(track => track.id !== trackId);
    });
  }

  /** Appends the lowest free number ("Name 2", "Name 3", ...) when the name is already taken. */
  static #toUniqueName(name, scenes, ignoredSceneId = null) {
    const takenNames = new Set(scenes.filter(scene => scene.id !== ignoredSceneId).map(scene => scene.name));
    if (!takenNames.has(name)) return name;

    let suffix = 2;
    while (takenNames.has(`${name} ${suffix}`)) suffix++;
    return `${name} ${suffix}`;
  }

  static async #update(sceneId, mutate) {
    const scenes = foundry.utils.deepClone(this.getAll());
    const scene = scenes.find(candidate => candidate.id === sceneId);
    if (!scene) return;

    mutate(scene, scenes);
    await NarrativeSettings.saveAllScenes(scenes);
  }
}

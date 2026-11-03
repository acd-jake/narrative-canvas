import { SceneAudioController } from "./audio-controller.js";

/**
 * Player side: mirrors the GM's standalone track playback locally.
 */
export class TrackAudioReceiver {
  #controller = new SceneAudioController();

  /**
   * @param {{state: "playing"|"paused"|"stopped", track: {id: string, name: string, path: string}}} command
   */
  async apply({ state, track }) {
    if (!track?.id) return;

    switch (state) {
      case "playing":
        await this.#controller.play(track);
        break;
      case "paused":
        await this.#controller.pause(track.id);
        break;
      case "stopped":
        await this.#controller.stop(track.id);
        break;
    }
  }

  /**
   * @param {{globalVolume?: number, audioMuted?: boolean}} mix - Narrative state slice
   */
  applyMix({ globalVolume, audioMuted }) {
    if (globalVolume !== undefined) this.#controller.globalVolume = globalVolume;
    if (audioMuted !== undefined) this.#controller.muted = audioMuted;
  }

  async stopAll() {
    await this.#controller.stopAll();
  }
}

import { SceneAudioController } from "./audio-controller.js";
import { NarrativeLogger } from "./logger.js";

/**
 * Player side: mirrors the GM's standalone track playback locally.
 */
export class TrackAudioReceiver {
  #controller = new SceneAudioController();

  /**
   * @param {{state: "playing"|"paused"|"stopped", track: {id: string, name: string, path: string}}} command
   */
  async apply(command = {}) {
    const { state, track } = command;
    if (!track?.id || !track.path) {
      NarrativeLogger.warn("Ignoring standalone audio command with incomplete track data", {
        state,
        trackId: track?.id,
        hasPath: Boolean(track?.path)
      });
      return;
    }

    NarrativeLogger.debug("Applying standalone audio command", {
      state,
      trackId: track.id,
      trackName: track.name
    });

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
      default:
        NarrativeLogger.warn("Ignoring standalone audio command with unknown state", {
          state,
          trackId: track.id
        });
    }
  }

  /**
   * @param {{globalVolume?: number, audioMuted?: boolean}} mix - Narrative state slice
   */
  applyMix({ globalVolume, audioMuted }) {
    NarrativeLogger.debug("Applying synchronized audio mix", { globalVolume, audioMuted });
    if (globalVolume !== undefined) this.#controller.globalVolume = globalVolume;
    if (audioMuted !== undefined) this.#controller.muted = audioMuted;
  }

  async stopAll() {
    await this.#controller.stopAll();
  }
}

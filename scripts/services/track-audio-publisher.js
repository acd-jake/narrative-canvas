import { NarrativeSocket } from "./socket.js";

/**
 * GM side: publishes standalone track playback changes so players can mirror them.
 * Playlist playback is synchronized natively by Foundry and is not handled here.
 */
export class TrackAudioPublisher {
  static EVENT_TYPE = "TRACK_AUDIO";

  /**
   * @param {SceneAudioController} controller - Source of track data
   * @param {string} trackId
   * @param {"playing"|"paused"|"stopped"} state
   */
  static publishStateChange(controller, trackId, state) {
    if (!game.user.isGM) return;

    const track = controller.getTrack(trackId);
    if (!track) return;

    NarrativeSocket.emit(this.EVENT_TYPE, { state, track: this.#toPayload(track) });
  }

  /**
   * Replays all currently playing tracks to a single user, e.g. after a late join.
   * @param {SceneAudioController} controller
   * @param {string} targetUserId
   */
  static publishPlayingTracksTo(controller, targetUserId) {
    for (const track of controller.getPlayingTracks()) {
      NarrativeSocket.emit(this.EVENT_TYPE, { state: "playing", track: this.#toPayload(track) }, targetUserId);
    }
  }

  static #toPayload({ id, name, path }) {
    return { id, name, path };
  }
}

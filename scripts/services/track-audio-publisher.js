import { NarrativeSocket } from "./socket.js";
import { NarrativeLogger } from "./logger.js";

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
    if (!game.user.isGM) {
      NarrativeLogger.warn("Non-GM attempted to publish standalone audio state", { trackId, state });
      return;
    }

    const track = controller.getTrack(trackId);
    if (!track) {
      NarrativeLogger.warn("Cannot publish standalone audio state because the track is unknown", {
        trackId,
        state
      });
      return;
    }

    NarrativeLogger.info("Publishing standalone audio state", {
      trackId,
      trackName: track.name,
      state
    });
    NarrativeSocket.emit(this.EVENT_TYPE, { state, track: this.#toPayload(track) });
  }

  /**
   * Replays all currently playing tracks to a single user, e.g. after a late join.
   * @param {SceneAudioController} controller
   * @param {string} targetUserId
   */
  static publishPlayingTracksTo(controller, targetUserId) {
    const tracks = controller.getPlayingTracks();
    NarrativeLogger.info("Synchronizing active standalone tracks to joining client", {
      targetUserId,
      trackCount: tracks.length,
      trackIds: tracks.map(track => track.id)
    });

    for (const track of tracks) {
      NarrativeSocket.emit(this.EVENT_TYPE, { state: "playing", track: this.#toPayload(track) }, targetUserId);
    }
  }

  static #toPayload({ id, name, path }) {
    return { id, name, path };
  }
}

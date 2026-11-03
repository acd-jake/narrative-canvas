import { NarrativeLogger } from "./logger.js";

/**
 * Manages playback state for narrative scene audio tracks.
 * Handles playing, pausing, stopping, and volume adjustment across multiple active tracks.
 */
export class SceneAudioController {
  #sounds = new Map();
  #tracks = new Map();
  #states = new Map();
  #volumes = new Map();
  #globalVolume = 0.5;
  #muted = false;
  #onStateChange = null;

  /**
   * @param {object} [options]
   * @param {number} [options.globalVolume=0.5]
   * @param {(trackId: string, state: "playing"|"paused"|"stopped") => void} [options.onStateChange]
   */
  constructor({ globalVolume = 0.5, onStateChange = null } = {}) {
    this.#globalVolume = globalVolume;
    this.#onStateChange = onStateChange;
  }

  get globalVolume() {
    return this.#globalVolume;
  }

  set globalVolume(val) {
    this.#globalVolume = Math.max(0, Math.min(1, Number(val) || 0));
    for (const [trackId] of this.#sounds) {
      this.#applyEffectiveVolume(trackId);
    }
  }

  get muted() {
    return this.#muted;
  }

  set muted(value) {
    this.#muted = Boolean(value);
    for (const [trackId] of this.#sounds) {
      this.#applyEffectiveVolume(trackId);
    }
  }

  /**
   * Returns current status of a track: "playing", "paused", or "stopped".
   * @param {string} trackId
   * @returns {"playing"|"paused"|"stopped"}
   */
  getTrackState(trackId) {
    return this.#states.get(trackId) ?? "stopped";
  }

  /**
   * Returns the track definition last used to play the given track id.
   * @param {string} trackId
   * @returns {object|undefined}
   */
  getTrack(trackId) {
    return this.#tracks.get(trackId);
  }

  /**
   * Returns the tracks that are currently playing.
   * @returns {object[]}
   */
  getPlayingTracks() {
    return [...this.#tracks.values()].filter(track => this.getTrackState(track.id) === "playing");
  }

  /**
   * Returns individual volume of a track (0.0 to 1.0, default 1.0).
   * @param {string} trackId
   * @returns {number}
   */
  getTrackVolume(trackId) {
    return this.#volumes.get(trackId) ?? 1.0;
  }

  /**
   * Sets individual track volume and updates playing sound immediately.
   * @param {string} trackId
   * @param {number} volume
   */
  setTrackVolume(trackId, volume) {
    const v = Math.max(0, Math.min(1, Number(volume) || 0));
    this.#volumes.set(trackId, v);
    this.#applyEffectiveVolume(trackId);
  }

  /**
   * Toggles play / pause for a track.
   * @param {object} track - { id: string, name: string, path: string }
   */
  async playOrPause(track) {
    if (!track?.id || !track.path) return;

    const current = this.getTrackState(track.id);
    if (current === "playing") {
      await this.pause(track.id);
    } else {
      await this.play(track);
    }
  }

  /**
   * Starts or resumes playback for a track.
   * @param {object} track
   */
  async play(track) {
    if (!track?.id || !track.path) {
      NarrativeLogger.warn("Cannot play audio track with incomplete data", {
        trackId: track?.id,
        trackName: track?.name,
        hasPath: Boolean(track?.path)
      });
      return;
    }

    NarrativeLogger.debug("Starting audio track playback", {
      trackId: track.id,
      trackName: track.name,
      path: track.path,
      volume: this.#calcEffectiveVolume(track.id),
      isMuted: this.#muted
    });
    this.#tracks.set(track.id, track);
    let sound = this.#sounds.get(track.id);

    if (sound && this.getTrackState(track.id) === "paused") {
      this.#applyEffectiveVolume(track.id);
      try {
        await sound.play({
          volume: this.#calcEffectiveVolume(track.id),
          loop: true
        });
        this.#states.set(track.id, "playing");
        NarrativeLogger.info("Resumed audio track", { trackId: track.id, trackName: track.name });
        this.#onStateChange?.(track.id, "playing");
        return;
      } catch (err) {
        NarrativeLogger.warn("Audio track resume failed; attempting to restart it", {
          trackId: track.id,
          trackName: track.name,
          error: err
        });
      }
    }

    if (sound) {
      try {
        await sound.stop();
      } catch (e) {}
    }

    try {
      const effectiveVol = this.#calcEffectiveVolume(track.id);
      sound = new foundry.audio.Sound(track.path, { context: game.audio.music });
      await sound.load();

      sound.addEventListener("end", () => {
        this.#states.set(track.id, "stopped");
        this.#onStateChange?.(track.id, "stopped");
      });
      sound.addEventListener("stop", () => {
        if (this.getTrackState(track.id) !== "paused") {
          this.#states.set(track.id, "stopped");
          this.#onStateChange?.(track.id, "stopped");
        }
      });

      this.#sounds.set(track.id, sound);
      this.#states.set(track.id, "playing");

      await sound.play({
        volume: effectiveVol,
        loop: true
      });

      NarrativeLogger.info("Audio track playback started", {
        trackId: track.id,
        trackName: track.name,
        volume: effectiveVol
      });
      this.#onStateChange?.(track.id, "playing");
    } catch (err) {
      NarrativeLogger.error("Audio track playback failed", {
        trackId: track.id,
        trackName: track.name,
        path: track.path,
        error: err
      });
      this.#states.set(track.id, "stopped");
      this.#onStateChange?.(track.id, "stopped");
    }
  }

  /**
   * Pauses an active track.
   * @param {string} trackId
   */
  async pause(trackId) {
    const sound = this.#sounds.get(trackId);
    const wasPlaying = Boolean(sound?.playing);
    if (sound) {
      try {
        if (sound.playing) {
          sound.pause();
        }
      } catch (err) {
        NarrativeLogger.warn("Pausing audio track failed", { trackId, error: err });
      }
    }
    this.#states.set(trackId, "paused");
    NarrativeLogger.info("Audio track paused", { trackId, wasPlaying });
    this.#onStateChange?.(trackId, "paused");
  }

  /**
   * Stops a track completely and resets it.
   * @param {string} trackId
   */
  async stop(trackId) {
    const sound = this.#sounds.get(trackId);
    if (sound) {
      try {
        await sound.stop();
      } catch (err) {
        NarrativeLogger.warn("Stopping audio track failed", { trackId, error: err });
      }
      this.#sounds.delete(trackId);
    }
    this.#states.set(trackId, "stopped");
    NarrativeLogger.info("Audio track stopped", { trackId, hadSound: Boolean(sound) });
    this.#onStateChange?.(trackId, "stopped");
  }

  /**
   * Stops all active tracks (e.g. on canvas shutdown or scene switch).
   */
  async stopAll() {
    const trackIds = Array.from(this.#sounds.keys());
    await Promise.all(trackIds.map(id => this.stop(id)));
    this.#sounds.clear();
    this.#tracks.clear();
    this.#states.clear();
  }

  #calcEffectiveVolume(trackId) {
    const trackVol = this.getTrackVolume(trackId);
    return this.#muted ? 0 : Math.max(0, Math.min(1, this.#globalVolume * trackVol));
  }

  #applyEffectiveVolume(trackId) {
    const sound = this.#sounds.get(trackId);
    if (sound) {
      sound.volume = this.#calcEffectiveVolume(trackId);
    }
  }
}

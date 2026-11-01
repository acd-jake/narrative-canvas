/**
 * Manages playback state for narrative scene audio tracks.
 * Handles playing, pausing, stopping, and volume adjustment across multiple active tracks.
 */
export class SceneAudioController {
  #sounds = new Map();
  #states = new Map();
  #volumes = new Map();
  #globalVolume = 0.5;
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

  /**
   * Returns current status of a track: "playing", "paused", or "stopped".
   * @param {string} trackId
   * @returns {"playing"|"paused"|"stopped"}
   */
  getTrackState(trackId) {
    return this.#states.get(trackId) ?? "stopped";
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
      console.warn("Narrative Canvas | Cannot play track without path:", track);
      return;
    }

    let sound = this.#sounds.get(track.id);

    if (sound && this.getTrackState(track.id) === "paused") {
      this.#applyEffectiveVolume(track.id);
      try {
        await sound.play({
          volume: this.#calcEffectiveVolume(track.id),
          loop: true
        });
        this.#states.set(track.id, "playing");
        this.#onStateChange?.(track.id, "playing");
        return;
      } catch (err) {
        console.warn(`Narrative Canvas | Resume failed for track ${track.id}, restarting:`, err);
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

      this.#onStateChange?.(track.id, "playing");
    } catch (err) {
      console.error(`Narrative Canvas | Failed to play audio track "${track.name}":`, err);
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
    if (sound) {
      try {
        if (sound.playing) {
          sound.pause();
        }
      } catch (err) {
        console.warn(`Narrative Canvas | Pause failed for track ${trackId}:`, err);
      }
    }
    this.#states.set(trackId, "paused");
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
        console.warn(`Narrative Canvas | Stop failed for track ${trackId}:`, err);
      }
      this.#sounds.delete(trackId);
    }
    this.#states.set(trackId, "stopped");
    this.#onStateChange?.(trackId, "stopped");
  }

  /**
   * Stops all active tracks (e.g. on canvas shutdown or scene switch).
   */
  async stopAll() {
    const trackIds = Array.from(this.#sounds.keys());
    await Promise.all(trackIds.map(id => this.stop(id)));
    this.#sounds.clear();
    this.#states.clear();
  }

  #calcEffectiveVolume(trackId) {
    const trackVol = this.getTrackVolume(trackId);
    return Math.max(0, Math.min(1, this.#globalVolume * trackVol));
  }

  #applyEffectiveVolume(trackId) {
    const sound = this.#sounds.get(trackId);
    if (sound) {
      sound.volume = this.#calcEffectiveVolume(trackId);
    }
  }
}

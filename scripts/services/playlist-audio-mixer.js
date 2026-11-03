import { NarrativeLogger } from "./logger.js";

/** Applies the Canvas-local volume and mute mix to active Foundry PlaylistSounds. */
export class PlaylistAudioMixer {
  #tracks = new Map();
  #globalVolume = 0.5;
  #muted = false;
  #playlistSoundHook;

  constructor({ globalVolume = 0.5, muted = false } = {}) {
    this.#globalVolume = globalVolume;
    this.#muted = muted;
    this.#playlistSoundHook = Hooks.on("updatePlaylistSound", sound => this.applyTrackMix(sound));
  }

  get globalVolume() {
    return this.#globalVolume;
  }

  set globalVolume(value) {
    this.#globalVolume = Math.max(0, Math.min(1, Number(value) || 0));
    this.#applyMix();
  }

  get muted() {
    return this.#muted;
  }

  set muted(value) {
    this.#muted = Boolean(value);
    this.#applyMix();
  }

  setSceneTracks(tracks = []) {
    this.#tracks = new Map(tracks
      .filter(track => track?.id && track.sourcePlaylistId)
      .map(track => [track.id, track]));
    this.#applyMix();
  }

  applyTrackMix(playlistSound) {
    if (!playlistSound?.sound) return;
    const track = this.#tracks.get(playlistSound.id);
    if (!track || track.sourcePlaylistId !== playlistSound.parent?.id) return;

    playlistSound.sound.volume = this.#effectiveVolume(track, playlistSound.volume);
    NarrativeLogger.debug("Applied Canvas mix to Foundry PlaylistSound", {
      trackId: track.id,
      playlistId: track.sourcePlaylistId,
      volume: playlistSound.sound.volume,
      muted: this.#muted
    });
  }

  async stopLocalAll() {
    const sounds = [...this.#tracks.values()]
      .map(track => this.#getPlaylistSound(track)?.sound)
      .filter(sound => sound?.playing);
    await Promise.all(sounds.map(sound => sound.stop()));
    NarrativeLogger.info("Stopped local scene audio after the GM disconnected", {
      soundCount: sounds.length
    });
  }

  destroy() {
    if (this.#playlistSoundHook) Hooks.off("updatePlaylistSound", this.#playlistSoundHook);
    this.#playlistSoundHook = null;
  }

  #applyMix() {
    for (const track of this.#tracks.values()) {
      this.applyTrackMix(this.#getPlaylistSound(track));
    }
  }

  #getPlaylistSound(track) {
    const playlist = game.playlists?.get(track.sourcePlaylistId)
      ?? game.collections?.get("Playlist")?.get(track.sourcePlaylistId);
    return playlist?.sounds?.get(track.id) ?? null;
  }

  #effectiveVolume(track, baseVolume = 1) {
    const trackVolume = Math.max(0, Math.min(1, Number(baseVolume) || 0));
    return this.#muted ? 0 : Math.max(0, Math.min(1, this.#globalVolume * trackVolume));
  }
}
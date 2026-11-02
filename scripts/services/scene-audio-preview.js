export class SceneAudioPreview {
  #activePreview = null;
  #onStateChange;

  constructor(onStateChange = null) {
    this.#onStateChange = onStateChange;
  }

  get activeEntryId() {
    return this.#activePreview?.id ?? null;
  }

  async toggle(entry) {
    if (this.#activePreview?.id === entry.id) {
      await this.stop();
      return;
    }

    await this.stop();
    const preview = { id: entry.id, sounds: [], soundIndex: -1, sound: null };
    this.#activePreview = preview;
    this.#onStateChange?.(entry.id, true);

    try {
      if (entry.type === "playlist") {
        const playlist = game.playlists?.get(entry.playlistId)
          ?? game.collections?.get("Playlist")?.get(entry.playlistId);
        if (!playlist) throw new Error(`Playlist not found: ${entry.playlistId}`);
        const orderedIds = playlist.playbackOrder?.length
          ? playlist.playbackOrder
          : Array.from(playlist.sounds, sound => sound.id);
        preview.sounds = orderedIds
          .map(soundId => playlist.sounds.get(soundId))
          .filter(sound => sound?.path);
      } else if (entry.path) {
        preview.sounds = [{ path: entry.path }];
      }

      if (!preview.sounds.length) throw new Error("Audio entry has no playable sounds.");
      await this.#playNext(preview);
    } catch (error) {
      await this.#fail(preview, error);
    }
  }

  async stop() {
    const preview = this.#activePreview;
    if (!preview) return;

    this.#activePreview = null;
    try {
      await preview.sound?.stop();
    } catch (error) {
      console.warn("Narrative Canvas | Failed to stop audio preview:", error);
    }
    this.#onStateChange?.(preview.id, false);
  }

  async #playNext(preview) {
    if (this.#activePreview !== preview) return;
    const soundData = preview.sounds[++preview.soundIndex];
    if (!soundData) {
      this.#activePreview = null;
      this.#onStateChange?.(preview.id, false);
      return;
    }

    const sound = new foundry.audio.Sound(soundData.path, { context: game.audio.interface });
    preview.sound = sound;
    await sound.load();
    if (this.#activePreview !== preview) return;

    sound.addEventListener("end", () => {
      if (this.#activePreview !== preview) return;
      this.#playNext(preview).catch(error => this.#fail(preview, error));
    }, { once: true });
    await sound.play({ volume: 0.5, loop: false });
  }

  async #fail(preview, error) {
    if (this.#activePreview !== preview) return;
    console.warn("Narrative Canvas | Audio preview failed:", error);
    this.#activePreview = null;
    try {
      await preview.sound?.stop();
    } catch (stopError) {
      console.warn("Narrative Canvas | Failed to stop audio preview:", stopError);
    }
    this.#onStateChange?.(preview.id, false);
  }
}

import { NarrativeSceneRepository } from "./scene-repository.js";
import { stopOtherSceneAudio } from "./scene-audio-exclusivity.js";
import { NarrativeSettings } from "./settings.js";
import { LayoutRegistry } from "../ui/layout/layout-registry.js";

const clone = value => foundry.utils.deepClone(value);
const playlistById = id => game.playlists?.get(id) ?? game.collections?.get("Playlist")?.get(id);

export class NarrativeMacroAPI {
  constructor(manager) {
    this.manager = manager;
  }

  getScenes() { return clone(NarrativeSceneRepository.getAll()); }
  getScene() { return clone(this.manager.narrativeState.currentSceneData); }
  getState() { return clone(this.manager.narrativeState); }
  getBackgrounds() { return clone(this.manager.narrativeState.currentSceneData?.backgrounds ?? []); }
  getHandouts() { return clone(this.manager.narrativeState.currentSceneData?.handoutImages ?? []); }
  getOpenHandouts() { return clone(this.manager.narrativeState.handoutImageOverlays ?? []); }
  getActors() { return clone(this.manager.narrativeState.currentSceneData?.actors ?? []); }
  getStagedActors() { return clone(this.manager.narrativeState.activeActors ?? []); }
  getLayouts() { return { actor: clone(LayoutRegistry.getChoices("actor")), handout: clone(LayoutRegistry.getChoices("handout")), dialoguePosition: [...NarrativeSettings.ACTOR_DIALOGUE_POSITION_MODES] }; }
  getAudio() {
    return clone((this.manager.narrativeState.currentSceneData?.tracks ?? []).map(track => {
      const sound = playlistById(track.sourcePlaylistId)?.sounds?.get(track.id);
      return { ...track, playState: sound?.playing || sound?.sound?.playing ? "playing"
        : Number(sound?.pausedTime) > 0 ? "paused" : "stopped" };
    }));
  }

  flow() { this.#requireGM(); return new NarrativeFlow(this); }

  async open() { this.#requireGM(); await this.manager.toggleCanvasState(true); }
  async close() { this.#requireGM(); await this.manager.toggleCanvasState(false); }
  async setPlayerVisibility(visible) {
    this.#requireGM();
    await this.#callbacks().onVisibilityChange(Boolean(visible));
  }
  async selectScene(id) {
    this.#requireGM();
    if (id && !NarrativeSceneRepository.getAll().some(scene => scene.id === id)) throw new Error(`Unknown scene: ${id}`);
    await this.#callbacks().onSceneSelect(id || "");
  }
  async background(id) {
    this.#requireGM();
    const background = this.#find(this.getBackgrounds(), id, "background");
    await this.#callbacks().onBackgroundChange(background.path);
  }
  async clearBackground() { this.#requireGM(); await this.#callbacks().onBackgroundReset(); }

  async showHandout(id, options = {}) {
    this.#requireGM();
    const image = this.#find(this.getHandouts(), id, "handout");
    let overlay = this.#overlay(image.path, false);
    if (!overlay) {
      await this.#callbacks().onHandoutImageChange(image.path);
      overlay = this.#overlay(image.path);
    }
    if (Object.keys(options).length) await this.positionHandout(overlay.id, options);
    return overlay.id;
  }
  async closeHandout(id) {
    this.#requireGM();
    const overlay = this.#overlay(id, false);
    if (overlay) await this.#callbacks().onHandoutImageClose(overlay.id);
  }
  async closeAllHandouts() { this.#requireGM(); await this.#callbacks().onCloseAllHandouts(); }
  async positionHandout(id, { x, y, size, zIndex } = {}) {
    this.#requireGM();
    const overlay = this.#overlay(id);
    for (const [name, value, min, max] of [["x", x, 0, 1], ["y", y, 0, 1], ["size", size, 0.25, 1.5]]) {
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)) {
        throw new RangeError(`${name} must be between ${min} and ${max}`);
      }
    }
    const controller = this.manager.view?.handoutImageOverlayController;
    const overlays = this.getOpenHandouts().map(item => ({
      ...item,
      position: item.position ?? controller?.positions.get(item.id),
      size: item.size ?? controller?.sizes.get(item.id)
    }));
    if (zIndex !== undefined && (!Number.isInteger(zIndex) || zIndex < 0 || zIndex >= overlays.length)) {
      throw new RangeError(`zIndex must be an integer between 0 and ${overlays.length - 1}`);
    }
    const index = overlays.findIndex(item => item.id === overlay.id);
    const [item] = overlays.splice(index, 1);
    item.position = { x: x ?? item.position?.x ?? 0.5, y: y ?? item.position?.y ?? 0.5 };
    item.size = size ?? item.size ?? 1;
    overlays.splice(zIndex ?? index, 0, item);
    const layout = overlays.map(({ id: overlayId, position, size: overlaySize }) => ({
      id: overlayId, position: position ?? { x: 0.5, y: 0.5 }, size: overlaySize ?? 1
    }));
    await this.manager.handleHandoutImageLayout(layout, true);
    this.manager.view?.applyHandoutImageLayout(layout);
  }

  async addActor(id) {
    this.#requireGM();
    this.#find(this.getActors(), id, "actor");
    if (!this.getStagedActors().some(actor => actor.id === id)) await this.#callbacks().onActorStageToggle(id);
  }
  async removeActor(id) { this.#requireGM(); await this.#callbacks().onActorStageRemove(id); }
  async clearActors() { this.#requireGM(); await this.#callbacks().onActorStageClear(); }
  async orderActors(ids) {
    this.#requireGM();
    const staged = this.getStagedActors();
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !staged.some(actor => actor.id === id))) {
      throw new Error("Actor order must contain unique staged actor IDs");
    }
    await this.#callbacks().onActorOrderChange(ids);
  }
  async setSpeaker(id = null) {
    this.#requireGM();
    const current = this.manager.narrativeState.activeSpeakerId;
    if (id) this.#find(this.getActors(), id, "actor");
    if (id === current) return;
    if (id) await this.#callbacks().onActorSpeakerToggle(id);
    else if (current) await this.#callbacks().onActorSpeakerToggle(current);
  }
  async setVisualNovelVisibility(visible) {
    this.#requireGM();
    if (Boolean(visible) !== this.manager.narrativeState.isVisualNovelOverlayVisible) {
      await this.#callbacks().onVisualNovelOverlayVisibilityToggle();
    }
  }
  async setActorLayout(strategy = null) {
    this.#requireGM();
    if (strategy && !Object.hasOwn(LayoutRegistry.getChoices("actor"), strategy)) throw new Error(`Unknown actor layout: ${strategy}`);
    await this.#callbacks().onActorLayoutChange(strategy);
  }
  async setHandoutLayout(strategy = null) {
    this.#requireGM();
    if (strategy && !Object.hasOwn(LayoutRegistry.getChoices("handout"), strategy)) throw new Error(`Unknown handout layout: ${strategy}`);
    await this.#callbacks().onHandoutLayoutChange(strategy);
  }
  async setDialoguePosition(mode = null) {
    this.#requireGM();
    if (mode && !NarrativeSettings.ACTOR_DIALOGUE_POSITION_MODES.includes(mode)) throw new Error(`Unknown dialogue position: ${mode}`);
    await this.#callbacks().onActorDialoguePositionModeChange(mode);
  }
  async setDialogueEnabled(enabled) {
    this.#requireGM();
    if (Boolean(enabled) !== this.manager.narrativeState.dialogueSystemEnabled) await this.#callbacks().onDialogueToggle();
  }
  async dialogue(text, { speakerId = this.manager.narrativeState.activeSpeakerId, voice = false, language, speedFactor } = {}) {
    this.#requireGM();
    if (!speakerId) throw new Error("A speaker ID or active speaker is required for dialogue");
    this.#find(this.getActors(), speakerId, "actor");
    await this.#sendLine({ speakerId, text, voice, language, speedFactor });
  }
  async narrate(text, { voice = false, speedFactor } = {}) {
    this.#requireGM();
    await this.#sendLine({ speakerId: "", text, voice, speedFactor });
  }
  async dismissDialogue() {
    this.#requireGM();
    const line = this.manager.narrativeState.dialogueLine;
    if (line && !line.dismissed) await this.manager.handleDisplayUpdate({ dialogueLine: { ...line, dismissed: true } });
  }
  async #sendLine(line) {
    if (typeof line.text !== "string" || !line.text.trim()) throw new Error("Dialogue text must not be empty");
    if (!this.manager.narrativeState.dialogueSystemEnabled) await this.manager.handleDisplayUpdate({ dialogueSystemEnabled: true });
    await this.#callbacks().onDialogueSend(line);
  }

  async playAudio(id) {
    this.#requireGM();
    this.#requireDirector();
    const track = this.#find(this.getAudio(), id, "audio track");
    const playlist = playlistById(track.sourcePlaylistId);
    const sound = playlist?.sounds?.get(track.id);
    if (!playlist || !sound) throw new Error(`PlaylistSound not found for track: ${id}`);
    await stopOtherSceneAudio(this.getAudio(), { playlistId: playlist.id, trackId: sound.id, isPlaylistGroup: false }, playlistById);
    if (!sound.playing && !sound.sound?.playing) await playlist.playSound(sound);
    this.manager.view?.sidebar?.trackScenePlaylist(playlist.id);
  }
  async stopAudio(id) {
    this.#requireGM();
    const track = this.#find(this.getAudio(), id, "audio track");
    const playlist = playlistById(track.sourcePlaylistId);
    const sound = playlist?.sounds?.get(track.id);
    if (!playlist || !sound) throw new Error(`PlaylistSound not found for track: ${id}`);
    await playlist.stopSound(sound);
    this.manager.view?.sidebar?.refreshAudioPlayback();
  }
  async playPlaylist(id) {
    this.#requireGM();
    this.#requireDirector();
    if (!this.getAudio().some(track => track.sourcePlaylistId === id && track.isPlaylistGroup !== false)) throw new Error(`Unknown scene playlist: ${id}`);
    const playlist = playlistById(id);
    if (!playlist) throw new Error(`Playlist not found: ${id}`);
    await stopOtherSceneAudio(this.getAudio(), { playlistId: id, isPlaylistGroup: true }, playlistById);
    await playlist.playAll();
    this.manager.view?.sidebar?.trackScenePlaylist(id);
  }
  async stopPlaylist(id) {
    this.#requireGM();
    if (!this.getAudio().some(track => track.sourcePlaylistId === id && track.isPlaylistGroup !== false)) throw new Error(`Unknown scene playlist: ${id}`);
    const playlist = playlistById(id);
    if (!playlist) throw new Error(`Playlist not found: ${id}`);
    await playlist.stopAll();
    await Promise.all(Array.from(playlist.sounds ?? []).filter(sound => !sound.playing && Number(sound.pausedTime) > 0)
      .map(sound => sound.update({ playing: false, pausedTime: 0 })));
    this.manager.view?.sidebar?.refreshAudioPlayback();
  }
  async setVolume(volume) {
    this.#requireGM();
    if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || volume > 1) throw new RangeError("Volume must be between 0 and 1");
    await this.#callbacks().onVolumeChange(volume);
  }
  async setMuted(muted) { this.#requireGM(); await this.#callbacks().onAudioMuteChange(Boolean(muted)); }

  #callbacks() { return this.manager.directorActions.createCallbacks(); }
  #requireGM() { if (!game.user?.isGM) throw new Error("Narrative Canvas API requires a GM"); }
  #requireDirector() { if (!this.manager.narrativeState.active || !this.manager.view?.sidebar) throw new Error("Open the Narrative Canvas before starting audio"); }
  #find(items, id, type) {
    if (typeof id !== "string" || !id) throw new Error(`Unknown ${type}: ${id}`);
    const matches = items.filter(item => item.id === id || item.path === id);
    if (matches.length !== 1) throw new Error(`${matches.length ? "Ambiguous" : "Unknown"} ${type}: ${id}`);
    return matches[0];
  }
  #overlay(id, required = true) {
    const image = this.getHandouts().find(item => item.id === id || item.path === id);
    const overlay = this.getOpenHandouts().find(item => item.id === id || item.src === id || item.src === image?.path);
    if (!overlay && required) throw new Error(`Handout is not open: ${id}`);
    return overlay;
  }
}

export class NarrativeFlow {
  #steps = [];
  #running = false;
  #paused = false;
  #listeners = new Set();

  constructor(api) { this.api = api; }
  #add(action, ...args) { this.#steps.push(() => this.api[action](...args)); return this; }
  open() { return this.#add("open"); }
  close() { return this.#add("close"); }
  setPlayerVisibility(visible) { return this.#add("setPlayerVisibility", visible); }
  selectScene(id) { return this.#add("selectScene", id); }
  background(id) { return this.#add("background", id); }
  clearBackground() { return this.#add("clearBackground"); }
  showHandout(id, options) { return this.#add("showHandout", id, options); }
  positionHandout(id, options) { return this.#add("positionHandout", id, options); }
  closeHandout(id) { return this.#add("closeHandout", id); }
  closeAllHandouts() { return this.#add("closeAllHandouts"); }
  addActor(id) { return this.#add("addActor", id); }
  removeActor(id) { return this.#add("removeActor", id); }
  clearActors() { return this.#add("clearActors"); }
  orderActors(ids) { return this.#add("orderActors", ids); }
  setSpeaker(id) { return this.#add("setSpeaker", id); }
  setVisualNovelVisibility(visible) { return this.#add("setVisualNovelVisibility", visible); }
  setActorLayout(strategy) { return this.#add("setActorLayout", strategy); }
  setHandoutLayout(strategy) { return this.#add("setHandoutLayout", strategy); }
  setDialoguePosition(mode) { return this.#add("setDialoguePosition", mode); }
  setDialogueEnabled(enabled) { return this.#add("setDialogueEnabled", enabled); }
  dialogue(text, options) { return this.#add("dialogue", text, options); }
  narrate(text, options) { return this.#add("narrate", text, options); }
  dismissDialogue() { return this.#add("dismissDialogue"); }
  playAudio(id) { return this.#add("playAudio", id); }
  stopAudio(id) { return this.#add("stopAudio", id); }
  playPlaylist(id) { return this.#add("playPlaylist", id); }
  stopPlaylist(id) { return this.#add("stopPlaylist", id); }
  setVolume(volume) { return this.#add("setVolume", volume); }
  setMuted(muted) { return this.#add("setMuted", muted); }
  pause() { this.#paused = true; this.#notify(); return this; }
  resume() { this.#paused = false; this.#notify(); return this; }
  wait(milliseconds) {
    if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("Wait must be a non-negative number of milliseconds");
    this.#steps.push(signal => this.#wait(milliseconds, signal));
    return this;
  }
  async run({ signal } = {}) {
    if (this.#running) throw new Error("Flow is already running");
    this.#running = true;
    try {
      for (const step of [...this.#steps]) {
        await this.#waitUntilResumed(signal);
        this.#checkAbort(signal);
        await step(signal);
      }
    } finally { this.#running = false; }
  }

  #notify() { for (const listener of [...this.#listeners]) listener(); }
  #checkAbort(signal) { if (signal?.aborted) throw signal.reason ?? new Error("Flow cancelled"); }
  async #waitUntilResumed(signal) {
    this.#checkAbort(signal);
    while (this.#paused) {
      await this.#waitForChange(signal);
      this.#checkAbort(signal);
    }
  }
  #waitForChange(signal, milliseconds) {
    this.#checkAbort(signal);
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        this.#listeners.delete(changed);
        signal?.removeEventListener("abort", aborted);
      };
      const changed = () => { cleanup(); resolve(); };
      const aborted = () => { cleanup(); reject(signal.reason ?? new Error("Flow cancelled")); };
      this.#listeners.add(changed);
      signal?.addEventListener("abort", aborted, { once: true });
      if (milliseconds !== undefined) timer = setTimeout(changed, milliseconds);
    });
  }
  async #wait(milliseconds, signal) {
    let remaining = milliseconds;
    while (remaining > 0) {
      await this.#waitUntilResumed(signal);
      const started = Date.now();
      await this.#waitForChange(signal, remaining);
      remaining = Math.max(0, remaining - (Date.now() - started));
    }
    this.#checkAbort(signal);
  }
}
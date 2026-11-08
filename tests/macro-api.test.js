import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NarrativeMacroAPI } from "../scripts/services/macro-api.js";
import { NarrativeDirectorActions } from "../scripts/services/director-actions.js";
import { NarrativeSceneRepository } from "../scripts/services/scene-repository.js";
import { NarrativeSettings } from "../scripts/services/settings.js";

describe("NarrativeMacroAPI", () => {
  let manager;
  let api;
  let scene;

  beforeEach(() => {
    scene = {
      id: "scene-1",
      backgrounds: [{ id: "bg-1", path: "background.webp" }],
      handoutImages: [{ id: "handout-1", path: "handout.webp" }, { id: "handout-2", path: "other.webp" }],
      actors: [{ id: "actor-1", name: "Alex", img: "alex.webp" }, { id: "actor-2", name: "Sam" }],
      tracks: []
    };
    vi.stubGlobal("foundry", { utils: { deepClone: value => structuredClone(value), randomID: () => "line-1" } });
    vi.stubGlobal("game", { user: { isGM: true }, modules: new Map(), playlists: new Map() });
    vi.spyOn(NarrativeSceneRepository, "getAll").mockReturnValue([scene]);
    vi.spyOn(NarrativeSettings, "getDialogueSpeedMultiplier").mockReturnValue(1);
    manager = {
      narrativeState: {
        active: true, playerViewActive: true, currentSceneData: scene, activeSceneId: scene.id,
        activeActors: [], activeSpeakerId: null, handoutImageOverlays: [], dialogueSystemEnabled: true
      },
      handleDisplayUpdate: vi.fn(async update => { manager.narrativeState = { ...manager.narrativeState, ...update }; }),
      handleHandoutImageLayout: vi.fn(async layout => {
        manager.narrativeState.handoutImageOverlays = layout.map(item => ({
          ...manager.narrativeState.handoutImageOverlays.find(overlay => overlay.id === item.id), ...item
        }));
      }),
      view: { applyHandoutImageLayout: vi.fn(), sidebar: { refreshAudioPlayback: vi.fn(), trackScenePlaylist: vi.fn() } }
    };
    manager.directorActions = new NarrativeDirectorActions({
      getState: () => manager.narrativeState,
      handleDisplayUpdate: update => manager.handleDisplayUpdate(update),
      handleHandoutImageLayout: (...args) => manager.handleHandoutImageLayout(...args),
      activateSceneAudio: vi.fn(),
      addHandoutImageOverlay: image => [...manager.narrativeState.handoutImageOverlays, { ...image, id: `overlay-${image.src}` }]
    });
    api = new NarrativeMacroAPI(manager);
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("returns detached scene data and rejects non-GM mutations", async () => {
    api.getHandouts()[0].path = "changed";
    expect(scene.handoutImages[0].path).toBe("handout.webp");
    game.user.isGM = false;
    await expect(api.background("bg-1")).rejects.toThrow("requires a GM");
    expect(() => api.flow()).toThrow("requires a GM");
  });

  it("opens handouts idempotently and updates relative position, size and order", async () => {
    const first = await api.showHandout("handout-1");
    await api.showHandout("handout-2");
    expect(await api.showHandout("handout-1", { x: 0.2, y: 0.8, size: 1.2, zIndex: 1 })).toBe(first);
    expect(api.getOpenHandouts()).toHaveLength(2);
    expect(api.getOpenHandouts()[1]).toMatchObject({ id: first, position: { x: 0.2, y: 0.8 }, size: 1.2 });
    expect(manager.handleHandoutImageLayout).toHaveBeenCalledWith(expect.any(Array), true);
    expect(manager.view.applyHandoutImageLayout).toHaveBeenCalledOnce();
    await expect(api.positionHandout(first, { x: 100 })).rejects.toThrow("between 0 and 1");
    await api.closeHandout("handout-1");
    expect(api.getOpenHandouts()).toHaveLength(1);
  });

  it("preserves rendered positions of other handouts when rearranging", async () => {
    const first = await api.showHandout("handout-1");
    const second = await api.showHandout("handout-2");
    manager.view.handoutImageOverlayController = {
      positions: new Map([[first, { x: 0.3, y: 0.4 }], [second, { x: 0.7, y: 0.8 }]]),
      sizes: new Map()
    };
    await api.positionHandout(first, { zIndex: 1 });
    expect(api.getOpenHandouts()[0]).toMatchObject({ id: second, position: { x: 0.7, y: 0.8 } });
    expect(api.getOpenHandouts()[1]).toMatchObject({ id: first, position: { x: 0.3, y: 0.4 } });
  });

  it("stages, orders and clears actors and sets an explicit speaker without toggling it off", async () => {
    await api.addActor("actor-1");
    await api.addActor("actor-1");
    await api.setSpeaker("actor-1");
    await api.setSpeaker("actor-1");
    await api.addActor("actor-2");
    await api.orderActors(["actor-1", "actor-2"]);
    expect(api.getStagedActors().map(actor => actor.id)).toEqual(["actor-1", "actor-2"]);
    expect(api.getState().activeSpeakerId).toBe("actor-1");
    await expect(api.orderActors(["actor-1", "actor-1"])).rejects.toThrow("unique");
    await api.removeActor("actor-1");
    expect(api.getState().activeSpeakerId).toBeNull();
  });

  it("sends dialogue and narration through the director with explicit voice settings", async () => {
    await api.setSpeaker("actor-1");
    manager.narrativeState.dialogueSystemEnabled = false;
    await api.dialogue("Hello");
    expect(api.getState().dialogueLine).toMatchObject({ text: "Hello", speakerName: "Alex", isNarrator: false });
    expect(api.getState().dialogueSystemEnabled).toBe(true);
    await api.narrate("The door opens.", { voice: false, speedFactor: 2 });
    expect(api.getState().dialogueLine).toMatchObject({ text: "The door opens.", isNarrator: true, speedFactor: 2 });
    await api.dismissDialogue();
    expect(api.getState().dialogueLine.dismissed).toBe(true);
  });

  it("uses Talking Actors for voiced lines only when the player canvas is visible", async () => {
    const processChatMessage = vi.fn();
    game.modules.set("acd-talking-actors", { active: true });
    game.acdTalkingActors = { chatProcessor: { processChatMessage } };
    vi.stubGlobal("ui", { chat: {} });
    vi.stubGlobal("ChatMessage", { getSpeaker: () => ({}) });
    vi.spyOn(NarrativeSettings, "shouldPostSpokenDialogueToChat").mockReturnValue(false);
    await api.dialogue("(whispers) Hello", { speakerId: "actor-1", voice: true });
    expect(processChatMessage).toHaveBeenCalledWith(ui.chat, "/talk {actor-1} (whispers) Hello", expect.any(Object), false);
    manager.narrativeState.playerViewActive = false;
    await api.narrate("Quiet", { voice: true });
    expect(processChatMessage).toHaveBeenCalledOnce();
  });

  it("starts scene tracks exclusively and stops them through Foundry playlists", async () => {
    const sound = { id: "track-1", playing: false };
    const other = { id: "track-2", playing: true };
    const playlist = { id: "playlist-1", sounds: new Map([[sound.id, sound], [other.id, other]]),
      playSound: vi.fn(), stopSound: vi.fn(), stopAll: vi.fn() };
    game.playlists.set(playlist.id, playlist);
    scene.tracks = [{ id: sound.id, sourcePlaylistId: playlist.id, isPlaylistGroup: false },
      { id: other.id, sourcePlaylistId: playlist.id, isPlaylistGroup: false }];
    expect(api.getAudio()[1].playState).toBe("playing");
    await api.playAudio(sound.id);
    expect(playlist.stopSound).toHaveBeenCalledWith(other);
    expect(playlist.playSound).toHaveBeenCalledWith(sound);
    expect(manager.view.sidebar.trackScenePlaylist).toHaveBeenCalledWith(playlist.id);
    await api.stopAudio(sound.id);
    expect(playlist.stopSound).toHaveBeenCalledWith(sound);
  });

  it("starts and stops scene playlist groups", async () => {
    const sound = { id: "track-1", playing: false, pausedTime: 3, update: vi.fn() };
    const sounds = { get: id => id === sound.id ? sound : undefined, [Symbol.iterator]: () => [sound][Symbol.iterator]() };
    const playlist = { id: "playlist-1", sounds, playAll: vi.fn(), stopAll: vi.fn() };
    game.playlists.set(playlist.id, playlist);
    scene.tracks = [{ id: sound.id, sourcePlaylistId: playlist.id, isPlaylistGroup: true }];
    await api.playPlaylist(playlist.id);
    expect(playlist.playAll).toHaveBeenCalledOnce();
    await api.stopPlaylist(playlist.id);
    expect(playlist.stopAll).toHaveBeenCalledOnce();
    expect(sound.update).toHaveBeenCalledWith({ playing: false, pausedTime: 0 });
  });

  it("runs flow steps sequentially and stops at errors", async () => {
    await api.flow().background("bg-1").addActor("actor-1").setSpeaker("actor-1")
      .dialogue("Hello").wait(0).narrate("Next").run();
    expect(api.getState()).toMatchObject({ background: "background.webp", activeSpeakerId: "actor-1", dialogueLine: { text: "Next" } });
    await expect(api.flow().background("missing").addActor("actor-2").run()).rejects.toThrow("Unknown background");
    expect(api.getStagedActors().some(actor => actor.id === "actor-2")).toBe(false);
  });

  it("cancels a running wait and does not execute later steps", async () => {
    const controller = new AbortController();
    const running = api.flow().wait(10000).background("bg-1").run({ signal: controller.signal });
    controller.abort();
    await expect(running).rejects.toThrow();
    expect(manager.narrativeState.background).toBeUndefined();
  });

  it("cancels while paused before running an action", async () => {
    const controller = new AbortController();
    const flow = api.flow().background("bg-1").pause();
    const running = flow.run({ signal: controller.signal });
    controller.abort();
    await expect(running).rejects.toThrow();
    expect(manager.narrativeState.background).toBeUndefined();
  });

  it("pauses an active wait until resumed", async () => {
    vi.useFakeTimers();
    try {
      const flow = api.flow().wait(1000).background("bg-1");
      const running = flow.run();
      await vi.advanceTimersByTimeAsync(400);
      flow.pause();
      await vi.advanceTimersByTimeAsync(2000);
      expect(manager.narrativeState.background).toBeUndefined();
      flow.resume();
      await vi.advanceTimersByTimeAsync(600);
      await running;
      expect(manager.narrativeState.background).toBe("background.webp");
    } finally { vi.useRealTimers(); }
  });
});
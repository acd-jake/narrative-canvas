import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NarrativeActiveStateStore } from "../scripts/services/active-state-store.js";
import { NarrativeSceneRepository } from "../scripts/services/scene-repository.js";
import { NarrativeSettings } from "../scripts/services/settings.js";

describe("NarrativeActiveStateStore", () => {
  beforeEach(() => {
    vi.stubGlobal("game", { user: { isGM: true } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists only the supported active-state fields", async () => {
    const saveActiveState = vi.spyOn(NarrativeSettings, "saveActiveState").mockResolvedValue();
    const store = new NarrativeActiveStateStore({ addHandoutImageOverlay: vi.fn() });

    await store.persist({
      activeSceneId: "scene-1",
      background: "background.webp",
      handoutImage: "handout.webp",
      handoutImageOverlays: [{
        id: "overlay-1",
        src: "handout.webp",
        title: "Handout",
        description: "Details",
        showDescription: true,
        size: 2,
        position: { x: 0.25, y: 0.75 },
        zOrder: 3,
        transient: true
      }],
      activeActors: [{
        id: "actor-1",
        name: "Investigator",
        img: "actor.webp",
        showName: false,
        transient: true
      }],
      activeSpeakerId: "actor-1",
      transient: true
    });

    expect(saveActiveState).toHaveBeenCalledWith({
      activeSceneId: "scene-1",
      background: "background.webp",
      handoutImage: "handout.webp",
      handoutImageOverlays: [{
        id: "overlay-1",
        src: "handout.webp",
        title: "Handout",
        description: "Details",
        showDescription: true,
        size: 1.5,
        position: { x: 0.25, y: 0.75 },
        zOrder: 3
      }],
      activeActors: [{
        id: "actor-1",
        name: "Investigator",
        img: "actor.webp",
        showName: false
      }],
      activeSpeakerId: "actor-1"
    });
  });

  it("does not persist active state for non-GM users", async () => {
    game.user.isGM = false;
    const saveActiveState = vi.spyOn(NarrativeSettings, "saveActiveState");
    const store = new NarrativeActiveStateStore({ addHandoutImageOverlay: vi.fn() });

    await store.persist({});

    expect(saveActiveState).not.toHaveBeenCalled();
  });

  it("restores only scene actors and refreshes overlay data from the scene", () => {
    const scene = {
      id: "scene-1",
      backgrounds: [{ path: "background.webp" }],
      handoutImages: [{
        path: "handout.webp",
        name: "Current title",
        description: "Current description",
        showDescription: true
      }],
      actors: [{ id: "actor-1", name: "Current actor", img: "actor.webp", showName: false }]
    };
    vi.spyOn(NarrativeSettings, "getActiveState").mockReturnValue({
      activeSceneId: "scene-1",
      background: "background.webp",
      handoutImage: "handout.webp",
      handoutImageOverlays: [{
        id: "overlay-1",
        src: "handout.webp",
        title: "Old title",
        description: "Old description",
        size: 2,
        position: { x: 0.4, y: 0.6 },
        zOrder: 1
      }],
      activeActors: [{ id: "actor-1" }, { id: "removed-actor" }],
      activeSpeakerId: "actor-1"
    });
    vi.spyOn(NarrativeSceneRepository, "getAll").mockReturnValue([scene]);
    const state = {};
    const store = new NarrativeActiveStateStore({ addHandoutImageOverlay: vi.fn() });

    store.restore(state);

    expect(state.activeSceneId).toBe("scene-1");
    expect(state.background).toBe("background.webp");
    expect(state.activeActors).toEqual([{
      id: "actor-1",
      name: "Current actor",
      img: "actor.webp",
      showName: false
    }]);
    expect(state.activeSpeakerId).toBe("actor-1");
    expect(state.handoutImageOverlays).toEqual([{
      id: "overlay-1",
      src: "handout.webp",
      title: "Current title",
      description: "Current description",
      showDescription: true,
      size: 1.5,
      position: { x: 0.4, y: 0.6 },
      zOrder: 1
    }]);
  });

  it("drops actor and speaker references when the saved scene no longer exists", () => {
    vi.spyOn(NarrativeSettings, "getActiveState").mockReturnValue({
      activeSceneId: "deleted-scene",
      background: "background.webp",
      handoutImageOverlays: [],
      activeActors: [{ id: "actor-1", img: "actor.webp" }],
      activeSpeakerId: "actor-1"
    });
    vi.spyOn(NarrativeSceneRepository, "getAll").mockReturnValue([]);
    const state = {};
    const store = new NarrativeActiveStateStore({ addHandoutImageOverlay: vi.fn() });

    store.restore(state);

    expect(state.activeSceneId).toBe("");
    expect(state.currentSceneData).toBeNull();
    expect(state.activeActors).toEqual([]);
    expect(state.activeSpeakerId).toBeNull();
    expect(state.handoutImageOverlays).toEqual([]);
  });

  it("recreates the selected handout overlay for legacy saved state", () => {
    const scene = {
      id: "scene-1",
      backgrounds: [],
      handoutImages: [{
        path: "handout.webp",
        name: "Handout",
        description: "Clue",
        showDescription: true
      }],
      actors: []
    };
    vi.spyOn(NarrativeSettings, "getActiveState").mockReturnValue({
      activeSceneId: "scene-1",
      handoutImage: "handout.webp",
      activeActors: []
    });
    vi.spyOn(NarrativeSceneRepository, "getAll").mockReturnValue([scene]);
    const restoredOverlay = { id: "restored", src: "handout.webp" };
    const addHandoutImageOverlay = vi.fn((image, overlays) => [...overlays, restoredOverlay]);
    const state = {};
    const store = new NarrativeActiveStateStore({ addHandoutImageOverlay });

    store.restore(state);

    expect(addHandoutImageOverlay).toHaveBeenCalledWith({
      src: "handout.webp",
      title: "Handout",
      description: "Clue",
      showDescription: true
    }, []);
    expect(state.handoutImageOverlays).toEqual([restoredOverlay]);
  });
});
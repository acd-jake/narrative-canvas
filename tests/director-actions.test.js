import { afterEach, describe, expect, it, vi } from "vitest";
import { NarrativeDirectorActions } from "../scripts/services/director-actions.js";
import { NarrativeSceneRepository } from "../scripts/services/scene-repository.js";

describe("NarrativeDirectorActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves eligible actors and selects an automatic background when changing scenes", async () => {
    const scene = {
      id: "scene-2",
      actors: [{ id: "actor-1" }],
      backgrounds: [{ path: "arrival.webp", viewAutomatically: true }]
    };
    vi.spyOn(NarrativeSceneRepository, "getAll").mockReturnValue([scene]);
    const state = {
      activeActors: [{ id: "actor-1" }, { id: "actor-removed" }],
      activeSpeakerId: "actor-1"
    };
    const handleDisplayUpdate = vi.fn().mockResolvedValue();
    const activateSceneAudio = vi.fn().mockResolvedValue();
    const actions = new NarrativeDirectorActions({
      getState: () => state,
      handleDisplayUpdate,
      handleHandoutImageLayout: vi.fn(),
      activateSceneAudio,
      reopenPlayerCanvases: vi.fn(),
      toggleCanvasState: vi.fn(),
      addHandoutImageOverlay: vi.fn()
    });

    await actions.createCallbacks().onSceneSelect("scene-2");

    expect(handleDisplayUpdate).toHaveBeenCalledWith({
      activeSceneId: "scene-2",
      currentSceneData: scene,
      activeActors: [{ id: "actor-1" }],
      activeSpeakerId: "actor-1",
      activeTrackId: null,
      background: "arrival.webp"
    });
    expect(activateSceneAudio).toHaveBeenCalledWith(scene);
  });

  it("ignores a scene selection that no longer exists", async () => {
    vi.spyOn(NarrativeSceneRepository, "getAll").mockReturnValue([]);
    const handleDisplayUpdate = vi.fn();
    const activateSceneAudio = vi.fn();
    const actions = new NarrativeDirectorActions({
      getState: () => ({ activeActors: [], activeSpeakerId: null }),
      handleDisplayUpdate,
      handleHandoutImageLayout: vi.fn(),
      activateSceneAudio,
      reopenPlayerCanvases: vi.fn(),
      toggleCanvasState: vi.fn(),
      addHandoutImageOverlay: vi.fn()
    });

    await actions.createCallbacks().onSceneSelect("deleted-scene");

    expect(handleDisplayUpdate).not.toHaveBeenCalled();
    expect(activateSceneAudio).not.toHaveBeenCalled();
  });
});
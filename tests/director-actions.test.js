import { afterEach, describe, expect, it, vi } from "vitest";
import { NarrativeDirectorActions } from "../scripts/services/director-actions.js";
import { NarrativeSceneRepository } from "../scripts/services/scene-repository.js";
import { NarrativeSettings } from "../scripts/services/settings.js";

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

  it("clears staged actors and the active speaker together", () => {
    const handleDisplayUpdate = vi.fn();
    const actions = new NarrativeDirectorActions({
      getState: () => ({ activeActors: [{ id: "actor-1" }], activeSpeakerId: "actor-1" }),
      handleDisplayUpdate,
      handleHandoutImageLayout: vi.fn(),
      activateSceneAudio: vi.fn(),
      reopenPlayerCanvases: vi.fn(),
      toggleCanvasState: vi.fn(),
      addHandoutImageOverlay: vi.fn()
    });

    actions.createCallbacks().onActorStageClear();

    expect(handleDisplayUpdate).toHaveBeenCalledWith({ activeActors: [], activeSpeakerId: null });
  });

  it("toggles player visibility for the Visual Novel overlay", () => {
    const state = { isVisualNovelOverlayVisible: true };
    const handleDisplayUpdate = vi.fn();
    const actions = new NarrativeDirectorActions({
      getState: () => state,
      handleDisplayUpdate,
      handleHandoutImageLayout: vi.fn(),
      activateSceneAudio: vi.fn(),
      reopenPlayerCanvases: vi.fn(),
      toggleCanvasState: vi.fn(),
      addHandoutImageOverlay: vi.fn()
    });

    actions.createCallbacks().onVisualNovelOverlayVisibilityToggle();

    expect(handleDisplayUpdate).toHaveBeenCalledWith({ isVisualNovelOverlayVisible: false });
  });

  it("sets temporary layout strategies and clears overrides for module defaults", () => {
    vi.spyOn(NarrativeSettings, "getActorLayoutStrategy").mockReturnValue("row");
    vi.spyOn(NarrativeSettings, "getHandoutLayoutOptions").mockReturnValue({ strategy: "free" });
    vi.spyOn(NarrativeSettings, "getActorDialoguePositionMode").mockReturnValue("dynamic");
    const handleDisplayUpdate = vi.fn();
    const actions = new NarrativeDirectorActions({
      getState: () => ({}),
      handleDisplayUpdate,
      handleHandoutImageLayout: vi.fn(),
      activateSceneAudio: vi.fn(),
      reopenPlayerCanvases: vi.fn(),
      toggleCanvasState: vi.fn(),
      addHandoutImageOverlay: vi.fn()
    });
    const callbacks = actions.createCallbacks();

    callbacks.onActorLayoutChange("arc");
    callbacks.onActorLayoutChange("row");
    callbacks.onHandoutLayoutChange("comic");
    callbacks.onHandoutLayoutChange("free");
    callbacks.onActorDialoguePositionModeChange("overlap");
    callbacks.onActorDialoguePositionModeChange("dynamic");

    expect(handleDisplayUpdate.mock.calls).toEqual([
      [{ actorLayoutOverride: "arc" }],
      [{ actorLayoutOverride: null }],
      [{ handoutLayoutOverride: "comic" }],
      [{ handoutLayoutOverride: null }],
      [{ actorDialoguePositionModeOverride: "overlap" }],
      [{ actorDialoguePositionModeOverride: null }]
    ]);
  });

  it("reorders staged actors while retaining actors omitted by a stale drag payload", () => {
    const state = {
      activeActors: [{ id: "actor-1" }, { id: "actor-2" }, { id: "actor-3" }]
    };
    const handleDisplayUpdate = vi.fn();
    const actions = new NarrativeDirectorActions({
      getState: () => state,
      handleDisplayUpdate,
      handleHandoutImageLayout: vi.fn(),
      activateSceneAudio: vi.fn(),
      reopenPlayerCanvases: vi.fn(),
      toggleCanvasState: vi.fn(),
      addHandoutImageOverlay: vi.fn()
    });

    actions.createCallbacks().onActorOrderChange(["actor-2", "actor-1"]);

    expect(handleDisplayUpdate).toHaveBeenCalledWith({
      activeActors: [{ id: "actor-2" }, { id: "actor-1" }, { id: "actor-3" }]
    });
  });
});
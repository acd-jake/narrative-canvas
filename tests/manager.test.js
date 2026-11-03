import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activateSceneAudio: vi.fn().mockResolvedValue(),
  getScenes: vi.fn(),
  render: vi.fn().mockResolvedValue(),
  setCanvasControlEnabled: vi.fn(),
  socketEmit: vi.fn(),
  themeActivate: vi.fn().mockResolvedValue()
}));

vi.mock("../scripts/services/scene-repository.js", () => ({
  NarrativeSceneRepository: { getAll: mocks.getScenes }
}));

vi.mock("../scripts/services/controls.js", () => ({
  NarrativeControls: { setCanvasControlEnabled: mocks.setCanvasControlEnabled }
}));

vi.mock("../scripts/services/socket.js", () => ({
  NarrativeSocket: { emit: mocks.socketEmit }
}));

vi.mock("../scripts/services/themes/theme-manager.js", () => ({
  ThemeManager: { activate: mocks.themeActivate }
}));

vi.mock("../scripts/ui/narrative-director.js", () => ({
  NarrativeDirector: class {
    async render() {
      return mocks.render();
    }

    async activateSceneAudio(sceneData) {
      return mocks.activateSceneAudio(sceneData);
    }
  }
}));

vi.mock("../scripts/ui/narrative-player.js", () => ({ NarrativePlayer: class {} }));
vi.mock("../scripts/ui/scene-editor.js", () => ({ NarrativeSceneEditor: class {} }));

describe("NarrativeManager canvas opening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts automatic audio for the restored active scene after opening", async () => {
    const scene = {
      id: "scene-1",
      actors: [],
      tracks: [{ id: "track-1", playAutomatically: true }]
    };
    mocks.getScenes.mockReturnValue([scene]);
    vi.stubGlobal("game", {
      user: { isGM: true },
      settings: { get: () => ({}) }
    });
    vi.stubGlobal("Hooks", { on: vi.fn(() => "hook-id"), off: vi.fn() });
    vi.stubGlobal("foundry", {
      applications: {
        api: {
          ApplicationV2: class {},
          HandlebarsApplicationMixin: Base => Base
        }
      }
    });

    const { NarrativeManager } = await import("../scripts/services/manager.js");
    const manager = new NarrativeManager();
    vi.spyOn(manager, "restorePersistedState").mockImplementation(() => {
      manager.narrativeState.activeSceneId = scene.id;
      manager.narrativeState.currentSceneData = scene;
    });

    await manager.toggleCanvasState(true);

    expect(mocks.render).toHaveBeenCalledOnce();
    expect(mocks.activateSceneAudio).toHaveBeenCalledOnce();
    expect(mocks.activateSceneAudio).toHaveBeenCalledWith(scene);
  });
});

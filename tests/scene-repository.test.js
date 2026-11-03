import { afterEach, describe, expect, it, vi } from "vitest";
import { NarrativeSceneRepository } from "../scripts/services/scene-repository.js";
import { NarrativeSettings } from "../scripts/services/settings.js";

describe("NarrativeSceneRepository", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("normalizes a copy without mutating stored scene data", () => {
    const storedScenes = [{ id: "scene-1" }];
    vi.spyOn(NarrativeSettings, "getAllScenes").mockReturnValue(storedScenes);
    vi.stubGlobal("game", { playlists: [], collections: { get: () => undefined } });
    vi.stubGlobal("foundry", {
      utils: {
        deepClone: value => JSON.parse(JSON.stringify(value))
      }
    });

    const scenes = NarrativeSceneRepository.getAll();

    expect(scenes).toEqual([{
      id: "scene-1",
      backgrounds: [],
      handoutImages: []
    }]);
    expect(scenes[0]).not.toBe(storedScenes[0]);
    expect(storedScenes).toEqual([{ id: "scene-1" }]);
  });
});
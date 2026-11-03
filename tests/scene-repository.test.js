import { afterEach, describe, expect, it, vi } from "vitest";
import { NarrativeSceneRepository } from "../scripts/services/scene-repository.js";
import { NarrativeSettings } from "../scripts/services/settings.js";

describe("NarrativeSceneRepository", () => {
  function stubSceneStorage(scenes) {
    vi.spyOn(NarrativeSettings, "getAllScenes").mockReturnValue(scenes);
    const saveAllScenes = vi.spyOn(NarrativeSettings, "saveAllScenes").mockImplementation(async updatedScenes => {
      scenes.splice(0, scenes.length, ...JSON.parse(JSON.stringify(updatedScenes)));
    });
    vi.stubGlobal("game", {
      playlists: new Map(),
      collections: { get: () => undefined },
      i18n: { localize: key => key }
    });
    vi.stubGlobal("foundry", {
      utils: { deepClone: value => JSON.parse(JSON.stringify(value)) }
    });
    return saveAllScenes;
  }

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

  it("reorders scenes in the persisted scene list", async () => {
    const scenes = [
      { id: "scene-1", backgrounds: [], handoutImages: [], actors: [], tracks: [] },
      { id: "scene-2", backgrounds: [], handoutImages: [], actors: [], tracks: [] },
      { id: "scene-3", backgrounds: [], handoutImages: [], actors: [], tracks: [] }
    ];
    const saveAllScenes = stubSceneStorage(scenes);

    await NarrativeSceneRepository.reorderScenes("scene-1", "scene-3", "after");

    expect(saveAllScenes).toHaveBeenCalledWith([
      expect.objectContaining({ id: "scene-2" }),
      expect.objectContaining({ id: "scene-3" }),
      expect.objectContaining({ id: "scene-1" })
    ]);
  });

  it("reorders images and actors within their scene collections", async () => {
    const scenes = [{
      id: "scene-1",
      backgrounds: [{ path: "a.webp" }, { path: "b.webp" }, { path: "c.webp" }],
      handoutImages: [],
      actors: [{ id: "actor-a" }, { id: "actor-b" }],
      tracks: []
    }];
    const saveAllScenes = stubSceneStorage(scenes);

    await NarrativeSceneRepository.reorderSceneItems("scene-1", "backgrounds", 0, 2, "after");
    await NarrativeSceneRepository.reorderSceneItems("scene-1", "actors", "actor-a", "actor-b", "after");

    const savedScene = saveAllScenes.mock.calls.at(-1)[0][0];
    expect(savedScene.backgrounds.map(image => image.path)).toEqual(["b.webp", "c.webp", "a.webp"]);
    expect(savedScene.actors.map(actor => actor.id)).toEqual(["actor-b", "actor-a"]);
  });

  it("moves playlist audio entries as one block", async () => {
    const scenes = [{
      id: "scene-1",
      backgrounds: [],
      handoutImages: [],
      actors: [],
      tracks: [
        { id: "sound-a", name: "A", sourcePlaylistId: "playlist-a", isPlaylistGroup: false },
        { id: "playlist-track-1", name: "Playlist 1", sourcePlaylistId: "playlist-group", isPlaylistGroup: true },
        { id: "sound-b", name: "B", sourcePlaylistId: "playlist-b", isPlaylistGroup: false },
        { id: "playlist-track-2", name: "Playlist 2", sourcePlaylistId: "playlist-group", isPlaylistGroup: true }
      ]
    }];
    const saveAllScenes = stubSceneStorage(scenes);

    await NarrativeSceneRepository.reorderSceneItems(
      "scene-1",
      "audioEntries",
      "playlist:playlist-group",
      "sound:sound-b",
      "after"
    );

    const savedTracks = saveAllScenes.mock.calls[0][0][0].tracks;
    expect(savedTracks.map(track => track.id)).toEqual([
      "sound-a",
      "sound-b",
      "playlist-track-1",
      "playlist-track-2"
    ]);
  });
});
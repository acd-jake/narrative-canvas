import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../scripts/ui/narrative-canvas.js", () => ({ NarrativeCanvas: class {} }));
vi.mock("../scripts/ui/director-sidebar.js", () => ({ DirectorSidebar: class {} }));
vi.mock("../scripts/ui/director-carousel.js", () => ({ DirectorActorCarousel: class {} }));
vi.mock("../scripts/ui/director-image-controls.js", () => ({ DirectorImageControls: class {} }));
vi.mock("../scripts/ui/director-canvas-toolbar.js", () => ({ DirectorCanvasToolbar: class {} }));
vi.mock("../scripts/services/playlist-audio-mixer.js", () => ({ PlaylistAudioMixer: class {} }));
vi.mock("../scripts/services/logger.js", () => ({
  NarrativeLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
}));

import { NarrativeDirector } from "../scripts/ui/narrative-director.js";

describe("NarrativeDirector automatic scene audio", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts and stops an automatic individual PlaylistSound", async () => {
    const sound = { id: "sound-1", name: "Rain" };
    const playlist = {
      id: "playlist-1",
      sounds: new Map([[sound.id, sound]]),
      playSound: vi.fn().mockResolvedValue(),
      stopSound: vi.fn().mockResolvedValue(),
      playAll: vi.fn(),
      stopAll: vi.fn()
    };
    vi.stubGlobal("game", {
      playlists: new Map([[playlist.id, playlist]]),
      collections: { get: () => undefined }
    });
    const director = Object.create(NarrativeDirector.prototype);
    director.automaticPlaylist = null;
    director.automaticPlaylistSound = null;
    director.audioMixer = { setSceneTracks: vi.fn() };
    director.sidebar = {
      stopAllPlaylists: vi.fn().mockResolvedValue(),
      refreshAudioPlayback: vi.fn()
    };
    const scene = {
      id: "scene-1",
      tracks: [{
        id: sound.id,
        sourcePlaylistId: playlist.id,
        isPlaylistGroup: false,
        playAutomatically: true
      }]
    };

    await director.activateSceneAudio(scene);

    expect(playlist.playSound).toHaveBeenCalledWith(sound);
    expect(playlist.playAll).not.toHaveBeenCalled();
    expect(director.automaticPlaylistSound).toBe(sound);

    await director.stopAllAudio();

    expect(playlist.stopSound).toHaveBeenCalledWith(sound);
    expect(playlist.stopAll).not.toHaveBeenCalled();
    expect(director.automaticPlaylistSound).toBeNull();
  });

  it("starts and stops an automatic playlist group as a whole", async () => {
    const playlist = {
      id: "playlist-1",
      sounds: new Map(),
      playSound: vi.fn(),
      stopSound: vi.fn(),
      playAll: vi.fn().mockResolvedValue(),
      stopAll: vi.fn().mockResolvedValue()
    };
    vi.stubGlobal("game", {
      playlists: new Map([[playlist.id, playlist]]),
      collections: { get: () => undefined }
    });
    const director = Object.create(NarrativeDirector.prototype);
    director.automaticPlaylist = null;
    director.automaticPlaylistSound = null;
    director.audioMixer = { setSceneTracks: vi.fn() };
    director.sidebar = {
      stopAllPlaylists: vi.fn().mockResolvedValue(),
      refreshAudioPlayback: vi.fn()
    };
    const scene = {
      id: "scene-1",
      tracks: [{
        id: "sound-1",
        sourcePlaylistId: playlist.id,
        isPlaylistGroup: true,
        playAutomatically: true
      }]
    };

    await director.activateSceneAudio(scene);

    expect(playlist.playAll).toHaveBeenCalledOnce();
    expect(playlist.playSound).not.toHaveBeenCalled();
    expect(director.automaticPlaylistSound).toBeNull();

    await director.stopAllAudio();

    expect(playlist.stopAll).toHaveBeenCalledOnce();
    expect(playlist.stopSound).not.toHaveBeenCalled();
  });
});

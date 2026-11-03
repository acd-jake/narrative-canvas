import { describe, expect, it, vi } from "vitest";
import { stopOtherSceneAudio } from "../scripts/services/scene-audio-exclusivity.js";

describe("stopOtherSceneAudio", () => {
  it("stops other active tracks and playlist groups but preserves the target track", async () => {
    const targetSound = { id: "target", playing: false };
    const otherSound = { id: "other", playing: true };
    const targetPlaylist = {
      id: "playlist-1",
      sounds: new Map([[targetSound.id, targetSound], [otherSound.id, otherSound]]),
      stopSound: vi.fn().mockResolvedValue(),
      stopAll: vi.fn().mockResolvedValue()
    };
    const groupPlaylist = {
      id: "playlist-2",
      sounds: new Map(),
      stopSound: vi.fn().mockResolvedValue(),
      stopAll: vi.fn().mockResolvedValue()
    };
    const individualPlaylist = {
      id: "playlist-3",
      sounds: new Map(),
      stopSound: vi.fn().mockResolvedValue(),
      stopAll: vi.fn().mockResolvedValue()
    };
    const playlists = new Map([
      [targetPlaylist.id, targetPlaylist],
      [groupPlaylist.id, groupPlaylist],
      [individualPlaylist.id, individualPlaylist]
    ]);
    const tracks = [
      { id: "target", sourcePlaylistId: "playlist-1", isPlaylistGroup: false },
      { id: "other", sourcePlaylistId: "playlist-1", isPlaylistGroup: false },
      { id: "group-track", sourcePlaylistId: "playlist-2", isPlaylistGroup: true },
      { id: "idle-track", sourcePlaylistId: "playlist-3", isPlaylistGroup: false }
    ];

    await stopOtherSceneAudio(
      tracks,
      { playlistId: "playlist-1", trackId: "target", isPlaylistGroup: false },
      playlistId => playlists.get(playlistId)
    );

    expect(targetPlaylist.stopSound).toHaveBeenCalledWith(otherSound);
    expect(targetPlaylist.stopAll).not.toHaveBeenCalled();
    expect(groupPlaylist.stopAll).toHaveBeenCalledOnce();
    expect(individualPlaylist.stopSound).not.toHaveBeenCalled();
    expect(individualPlaylist.stopAll).not.toHaveBeenCalled();
  });

  it("leaves the target playlist running when it is started as a group", async () => {
    const targetPlaylist = {
      id: "playlist-1",
      sounds: new Map(),
      stopSound: vi.fn(),
      stopAll: vi.fn()
    };
    const otherPlaylist = {
      id: "playlist-2",
      sounds: new Map(),
      stopSound: vi.fn(),
      stopAll: vi.fn().mockResolvedValue()
    };
    const playlists = new Map([
      [targetPlaylist.id, targetPlaylist],
      [otherPlaylist.id, otherPlaylist]
    ]);

    await stopOtherSceneAudio([
      { id: "target-track", sourcePlaylistId: "playlist-1", isPlaylistGroup: true },
      { id: "other-track", sourcePlaylistId: "playlist-2", isPlaylistGroup: true }
    ], {
      playlistId: "playlist-1",
      isPlaylistGroup: true
    }, playlistId => playlists.get(playlistId));

    expect(targetPlaylist.stopAll).not.toHaveBeenCalled();
    expect(otherPlaylist.stopAll).toHaveBeenCalledOnce();
  });
});

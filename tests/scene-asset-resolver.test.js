import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NarrativeSceneRepository } from "../scripts/services/scene-repository.js";
import { SceneAssetResolver } from "../scripts/services/scene-asset-resolver.js";

describe("SceneAssetResolver", () => {
  beforeEach(() => {
    vi.stubGlobal("game", {
      actors: new Map(),
      playlists: new Map(),
      collections: { get: () => undefined }
    });
    vi.stubGlobal("foundry", {
      utils: { fromUuid: vi.fn().mockResolvedValue(null) }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resolves an Actor drag payload into an add-to-scene action", async () => {
    const actor = { id: "actor-1", name: "Investigator", img: "actor.webp" };
    game.actors.set(actor.id, actor);
    const addActor = vi.spyOn(NarrativeSceneRepository, "addActor").mockResolvedValue();
    const resolver = new SceneAssetResolver();

    const asset = await resolver.resolve({ type: "Actor", id: actor.id });
    await asset.addTo("scene-1");

    expect(asset).toMatchObject({ type: "Actor", name: "Investigator" });
    expect(addActor).toHaveBeenCalledWith("scene-1", {
      id: "actor-1",
      name: "Investigator",
      img: "actor.webp",
      showName: true
    });
  });

  it("resolves an image drag payload into a background action", async () => {
    const addBackground = vi.spyOn(NarrativeSceneRepository, "addBackground").mockResolvedValue();
    const resolver = new SceneAssetResolver();

    const asset = await resolver.resolve({
      type: "Image",
      path: "journal/clue.webp",
      name: "Clue"
    });
    await asset.addTo("scene-1");

    expect(asset).toMatchObject({
      type: "background",
      name: "Clue",
      path: "journal/clue.webp"
    });
    expect(addBackground).toHaveBeenCalledWith("scene-1", "journal/clue.webp");
  });

  it("resolves JournalEntryPage UUIDs using their image source", async () => {
    foundry.utils.fromUuid.mockResolvedValue({
      documentName: "JournalEntryPage",
      name: "Journal clue",
      image: { src: "journal/page-image.webp" }
    });
    const resolver = new SceneAssetResolver();

    const asset = await resolver.resolve({ type: "JournalEntryPage", uuid: "JournalEntry.page-1" });

    expect(asset).toMatchObject({
      type: "background",
      name: "Journal clue",
      path: "journal/page-image.webp"
    });
  });

  it("resolves an individual PlaylistSound with its Foundry references", async () => {
    const sound = {
      id: "sound-1",
      name: "Rain",
      path: "audio/rain.ogg",
      uuid: "Playlist.pl-1.PlaylistSound.sound-1"
    };
    const playlist = {
      id: "pl-1",
      name: "Ambience",
      sounds: new Map([[sound.id, sound]])
    };
    game.playlists.set(playlist.id, playlist);
    const addTrack = vi.spyOn(NarrativeSceneRepository, "addTrack").mockResolvedValue();
    const resolver = new SceneAssetResolver();

    const asset = await resolver.resolve({
      type: "PlaylistSound",
      id: sound.id,
      playlistId: playlist.id
    });
    await asset.addTo("scene-1");

    expect(asset).toMatchObject({ type: "PlaylistSound", name: "Rain" });
    expect(addTrack).toHaveBeenCalledWith("scene-1", {
      id: sound.id,
      name: sound.name,
      path: sound.path,
      isPlaylistGroup: false,
      sourcePlaylistId: playlist.id,
      sourcePlaylistName: playlist.name,
      uuid: sound.uuid
    });
  });

  it("adds each playable sound from a dropped playlist", async () => {
    const playlist = {
      id: "pl-1",
      name: "Ambience",
      sounds: [
        { id: "sound-1", name: "Rain", path: "audio/rain.ogg", uuid: "sound-uuid" },
        { id: "sound-2", name: "Silence", path: "" }
      ]
    };
    game.playlists.set(playlist.id, playlist);
    const addTrack = vi.spyOn(NarrativeSceneRepository, "addTrack").mockResolvedValue();
    const resolver = new SceneAssetResolver();

    const asset = await resolver.resolve({ type: "Playlist", id: playlist.id });
    await asset.addTo("scene-1");

    expect(asset).toMatchObject({ type: "PlaylistSound", name: "Ambience" });
    expect(addTrack).toHaveBeenCalledTimes(1);
    expect(addTrack).toHaveBeenCalledWith("scene-1", {
      id: "sound-1",
      name: "Rain",
      path: "audio/rain.ogg",
      isPlaylistGroup: true,
      uuid: "sound-uuid",
      sourcePlaylistId: "pl-1",
      sourcePlaylistName: "Ambience"
    });
  });

  it("returns null for unsupported drag payloads", async () => {
    const resolver = new SceneAssetResolver();

    await expect(resolver.resolve({ type: "Unsupported" })).resolves.toBeNull();
  });
});
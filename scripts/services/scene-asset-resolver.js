import { NarrativeLogger } from "./logger.js";
import { NarrativeSceneRepository } from "./scene-repository.js";

/**
 * @typedef {object} ResolvedSceneAsset
 * @property {string} type
 * @property {string} name
 * @property {string} [path]
 * @property {(sceneId: string) => Promise<void>} addTo
 */

/** Resolves Foundry drag data to actions that can add assets to a narrative scene. */
export class SceneAssetResolver {
  /** @param {object} dropped */
  async resolve(dropped) {
    if (!dropped) return null;
    let doc = null;
    if (dropped.uuid) {
      try {
        doc = await foundry.utils.fromUuid(dropped.uuid);
      } catch (error) {
        console.warn("Narrative Canvas | Failed to resolve dropped UUID:", dropped.uuid, error);
      }
    }

    if (dropped.type === "Actor" || doc?.documentName === "Actor") {
      const actor = doc || game.actors.get(dropped.id) || game.actors.get(dropped.uuid?.split(".").pop());
      if (!actor) return null;
      return {
        type: "Actor",
        name: actor.name,
        addTo: sceneId => NarrativeSceneRepository.addActor(sceneId, {
          id: actor.id,
          name: actor.name,
          img: actor.img,
          showName: true
        })
      };
    }

    if (dropped.type === "Image" || doc?.documentName === "JournalEntryPage") {
      const path = dropped.path || doc?.src || doc?.image?.src;
      if (!path) return null;
      return {
        type: "background",
        name: dropped.name || doc?.name || "Image",
        path,
        addTo: sceneId => NarrativeSceneRepository.addBackground(sceneId, path)
      };
    }

    if (dropped.type === "PlaylistSound" || doc?.documentName === "PlaylistSound") {
      const playlists = game.playlists ?? game.collections?.get("Playlist");
      let soundDoc = doc?.documentName === "PlaylistSound" ? doc : null;
      let playlist = soundDoc?.parent?.sounds?.has(soundDoc.id) ? soundDoc.parent : null;
      if (!playlist && dropped.playlistId) playlist = playlists?.get(dropped.playlistId) ?? null;
      if (!playlist && playlists) {
        const soundId = soundDoc?.id ?? dropped.id;
        const soundPath = soundDoc?.path ?? dropped.path;
        playlist = Array.from(playlists).find(candidate =>
          candidate.sounds?.has(soundId)
          || Array.from(candidate.sounds ?? []).some(sound => sound.path === soundPath)
        ) ?? null;
      }
      if (!soundDoc) {
        soundDoc = playlist?.sounds?.get(dropped.id)
          ?? Array.from(playlist?.sounds ?? []).find(sound => sound.path === dropped.path)
          ?? null;
      }
      if (!soundDoc || !playlist) {
        NarrativeLogger.warn("Ignoring dropped audio that is not an existing Foundry PlaylistSound", {
          droppedId: dropped.id,
          droppedName: dropped.name,
          droppedPath: dropped.path
        });
        return null;
      }

      const name = soundDoc.name || dropped.name || "Track";
      const path = soundDoc.path;
      if (!path) return null;
      const track = {
        id: soundDoc.id,
        name,
        path,
        isPlaylistGroup: false,
        sourcePlaylistId: playlist.id,
        sourcePlaylistName: playlist.name,
        uuid: soundDoc.uuid
      };
      return {
        type: "PlaylistSound",
        name: track.name,
        addTo: sceneId => NarrativeSceneRepository.addTrack(sceneId, track)
      };
    }

    if (dropped.type === "Playlist" || doc?.documentName === "Playlist") {
      const playlist = doc || (dropped.id ? game.playlists?.get(dropped.id) : null);
      const sounds = Array.from(playlist?.sounds ?? []);
      if (!sounds.length) return null;
      return {
        type: "PlaylistSound",
        name: playlist.name,
        addTo: async sceneId => {
          for (const sound of sounds) {
            if (sound.path) {
              await NarrativeSceneRepository.addTrack(sceneId, {
                id: sound.id,
                name: sound.name,
                path: sound.path,
                isPlaylistGroup: true,
                uuid: sound.uuid,
                sourcePlaylistId: playlist.id,
                sourcePlaylistName: playlist.name
              });
            }
          }
        }
      };
    }
    return null;
  }
}
/** Stops other active-scene audio before a new track or playlist starts. */
export async function stopOtherSceneAudio(sceneTracks, target, getPlaylist) {
  const playlistsToStop = new Map();
  const soundsToStop = new Map();

  for (const track of sceneTracks ?? []) {
    const playlistId = track.sourcePlaylistId;
    if (!playlistId) continue;

    const isTargetPlaylist = playlistId === target.playlistId;
    if (isTargetPlaylist && (target.isPlaylistGroup || track.id === target.trackId)) continue;

    const playlist = getPlaylist(playlistId);
    if (!playlist) continue;

    if (track.isPlaylistGroup !== false) {
      playlistsToStop.set(playlistId, playlist);
      continue;
    }

    const sound = playlist.sounds?.get(track.id);
    if (sound?.playing || sound?.sound?.playing) {
      soundsToStop.set(`${playlistId}:${track.id}`, { playlist, sound });
    }
  }

  await Promise.all([...playlistsToStop.values()].map(playlist => playlist.stopAll()));
  await Promise.all([...soundsToStop.entries()]
    .filter(([key, { playlist }]) => !playlistsToStop.has(playlist.id))
    .map(([, { playlist, sound }]) => playlist.stopSound(sound)));
}

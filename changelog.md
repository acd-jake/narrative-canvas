# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Playlist audio appears as a single expandable entry in Director Controls, with per-track playback status and playlist-level controls.
- An active playback list below the master-volume control with pause/resume controls and accurate PlaylistSound status.

## [0.3] - 2026-11-03

### Added

- A Director mute toggle that silences scene audio independently from **Stop All**.

### Changed

- The Scene Audio section is visibly dimmed while audio is muted.
- A journal-docked Scene Configurator can extend beyond the browser edge without changing its width.

### Fixed

- The Journal Viewer selection now follows the configured ordering of journals and subfolders.

## [0.2] - 2026-11-03

### Added

- Scene Configurator options to select one automatic background and one automatic audio entry or playlist per scene.
- Automatic background display and audio playback when a scene is activated.
- An option to disable automatic activation of the first visible scene when a Journal Viewer selection filters out the active scene.
- Actor and audio drops anywhere in the Scene Configurator workspace, with automatic routing to the matching scene lists.

### Changed

- The Scene Configurator preserves editor-area scroll positions after content changes.
- The docked Scene Configurator follows the activated Journal Entry, matches its z-order, and retains its width across journal page changes.
- Images can be dropped into their designated Background Images or Handout Images areas.

## [0.1] - 2026-11-03

### Added

- Initial release for Foundry Virtual Tabletop 14; no specific game system required.
- Reusable scenes containing background images, handout images, actors, and audio tracks.
- The Narrative Canvas presentation stage with GM Director Controls and Preparation/Live modes.
- Live synchronization of presentation changes to players while the Canvas is published.
- Player controls to close the Canvas locally and reopen it while published; GMs can reopen it for players from the Director Controls.
- Visual Novel actor overlay with active-speaker highlighting and configurable nameplates.
- Multiple handout image overlays with independent positioning, resizing, and closing controls.
- A Scene Configurator that can be used as a free window or docked to a Journal Entry, including journal-linked scene filtering and a Journal Assets shelf.
- Journal Viewer support for displaying journal images on the stage.
- English and German localizations.

### Changed

- Handout overlays can be moved partly beyond the stage edge. Their close and resize controls retain a fixed screen size while the image is resized.

### Fixed

- Dragging handout images no longer changes their size unintentionally.

[Unreleased]: https://github.com/acd-jake/narrative-canvas/compare/0.3...HEAD
[0.3]: https://github.com/acd-jake/narrative-canvas/compare/0.2...0.3
[0.2]: https://github.com/acd-jake/narrative-canvas/compare/0.1...0.2
[0.1]: https://github.com/acd-jake/narrative-canvas/releases/tag/0.1
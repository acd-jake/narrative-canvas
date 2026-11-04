# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8] - 2026-11-04

### Added

- Dialogue system, toggled from the Director toolbar. A control row below the actor carousel lets the GM pick the speaker (synchronized with the active speaker, or the narrator when there is none), enter a line, send it with the button or Enter (Shift+Enter inserts a line break), and set the reveal speed, which is saved per user.
- Dialogue lines on the Visual Novel overlay with the theme's subtitle look. Text fades in character by character and fades out as a whole; the speaker's name is shown on the top edge, or an unknown-speaker label (configurable in the module settings) when the name is hidden. The GM can click a line to fade it out early for everyone.
- Narrator lines without a name, shown from the middle of the screen, fading in as a whole and staying visible longer the longer the text is.
- Optional **Talking Actors** integration: a voice toggle reads lines aloud with `/talk` (or `/narrate` for the narrator) only while the canvas is released to the players. The Live badge shows whether lines would currently be read aloud.
- Optional **Polyglot** integration: a language selector for dialogue lines (the default language for the narrator); players who do not know the language see scrambled text.
- Journal Viewer: selected text can be sent to the dialogue input from a context menu, and read-aloud sections get a button to send their text. The CSS class that marks read-aloud sections is selectable per game system (Call of Cthulhu 7e, Pathfinder 2e) or custom in the module settings.
- Theme elements `dialogueText`, `dialogueSpeaker` and `narrationText` to style dialogue lines per theme.
- A module setting to choose whether dialogue lines that are read aloud are also posted to the chat.
- Four additional themes: Cyberpunk, Cosmic Horror, Western and Art Deco.
- The active speaker is shown larger in the carousel (+15%) and on the Visual Novel overlay (+25%); the speaker highlight pulses while a dialogue line is shown.

### Changed

- The actor carousel is limited to the space between the Director sidebars; with the dialogue system active it spans that space and the actor list stays centered. Dialogue lines for the GM use the same span.
- Actor name plates on the Visual Novel overlay are 60% of their previous text size.
- The speaker toggle in the carousel moved to the middle of the lower tile edge.
- The release archive now includes the changelog.
- New actors on the Visual Novel overlay are added alternately on the left and right: on the right when an odd number of actors is already shown, otherwise on the left.
- The module settings are grouped into General, Appearance, Journal and Dialogue system sections.

### Fixed

- Collapsed Director panels no longer expand on their own when the Canvas state updates.

## [0.7] - 2026-11-03

### Added

- Director controls to remove all staged actors and hide the Visual Novel overlay from players while keeping a dimmed preview visible to the GM.
- Drag-and-drop actor reordering directly on the Visual Novel stage, with a floating actor preview and an animated insertion gap.
- Drag-to-reorder scenes, background and handout images, actors, and audio entries in the Scene Configurator; playlist tracks move together as a group.
- Expanded insertion zones across neighboring items make drop placement easier and animate items smoothly into their new order.

## [0.6.1] - 2026-11-03

### Changed

- Starting a scene track or playlist stops other active audio assigned to the active scene.

### Fixed

- Automatically start an individually selected PlaylistSound instead of starting its entire playlist.

### Added

- Regression tests for exclusive scene audio playback and automatic individual-track playback.

## [0.6] - 2026-11-03

### Added

- Regression coverage for automatic audio activation when reopening the Canvas with a restored active scene.

### Fixed

- Automatically start a scene's configured audio selection when reopening the Canvas with a restored active scene.

## [0.5.1] - 2026-11-03

### Fixed

- Included the `themes/` directory in the release archive so built-in theme definitions and frame artwork are available after installation.

## [0.5] - 2026-11-03

### Added

- Selectable Fantasy, Dark Fantasy, Science Fiction and Noir themes for subtitles, handout image captions and frames, actor name plates, and speaker highlights.
- A **Visual Theme** setting for the default theme and a Director toolbar control to switch themes for the current presentation.
- Player-local scene audio volume and mute controls.
- Journal Viewer controls to adjust page text size.
- Configurable logging levels for module diagnostics.
- Automated service tests for active-state restoration, scene changes, drag-and-drop asset processing, and scene repository behavior; tests run on pushes and pull requests.

### Changed

- Speaker highlight styling is now controlled by the active theme; the **Active Speaker Highlight Color** setting was removed.
- Handout image descriptions retain a constant on-screen size while their image is resized.
- Scene audio mixing now applies to Foundry PlaylistSound playback, preserving Foundry's client synchronization.
- Separated active-state persistence and Director actions from the manager, and isolated Foundry drag-data resolution from the Scene Configurator.
- Scene repository reads normalize a copy rather than mutating the stored settings value.

## [0.4] - 2026-11-03

### Added

- Playlist audio appears as a single expandable entry in Director Controls, with per-track playback status and playlist-level controls.
- A persistent **Now Playing** line above the master-volume control that identifies the active track or playlist track.
- Shared resize handles for both Director sidebars, with click-to-collapse/restore and drag resizing.
- Client-local percentage persistence for Director sidebar widths and resizable section/list heights.
- Scene audio playback is delegated to Foundry Playlist and PlaylistSound documents for native client synchronization.

### Changed

- Director sidebar widths default to 350px on the left and 175px on the right. Panels keep at least 150px of content while narrowing and collapse when dragged below 50px.
- Background and handout image tiles wrap into rows when space allows; their list headers share the Director section styling.
- The Audio section now appears below the image lists in the right Media & Audio sidebar.
- The Audio section is more compact: individual track-volume sliders and the duplicate active-playback list were removed; the master-volume slider remains.

### Fixed

- Dragging a PlaylistSound into a scene preserves its Foundry Playlist and track references.

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

- The Scene Audio section can be resized by dragging its header; playlists expand inside the shared scrollable audio list.
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

[Unreleased]: https://github.com/acd-jake/narrative-canvas/compare/0.7...HEAD
[0.7]: https://github.com/acd-jake/narrative-canvas/compare/0.6.1...0.7
[0.6.1]: https://github.com/acd-jake/narrative-canvas/compare/0.6...0.6.1
[0.6]: https://github.com/acd-jake/narrative-canvas/compare/0.5.1...0.6
[0.5.1]: https://github.com/acd-jake/narrative-canvas/compare/0.5...0.5.1
[0.5]: https://github.com/acd-jake/narrative-canvas/compare/0.4...0.5
[0.4]: https://github.com/acd-jake/narrative-canvas/compare/0.3...0.4
[0.3]: https://github.com/acd-jake/narrative-canvas/compare/0.2...0.3
[0.2]: https://github.com/acd-jake/narrative-canvas/compare/0.1...0.2
[0.1]: https://github.com/acd-jake/narrative-canvas/releases/tag/0.1
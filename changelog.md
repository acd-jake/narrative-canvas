# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.16.2] - 2026-11-06

### Changed

- The reading speed configuration limits have been updated.

## [0.16.1] - 2026-11-06

### Added

- Module setting "Handouts: Height (% of stage height)" (default 76, 30 to 100). It sets the initial height of a handout in the free layout, the upper limit when resizing it, and the maximum height of the area the comic layout may use.

## [0.16.0] - 2026-11-06

### Added

- Dialogue lines: the text output of a dialogue or narrator line can be paused and resumed.
- Handout layout strategies: the module setting "Handouts: Layout strategy" chooses between "Free" (move and scale manually, as before) and "Comic panels".
- Comic panels: handouts are arranged automatically like panels on a comic page and keep their aspect ratios. Settings: panel row width as a share of the viewport, maximum images per row (default 2), reading direction (left to right or right to left for manga) and caption position (top or bottom of the image). Descriptions appear as a caption inside the panel.
- Comic panels: the GM can reorder handouts by dragging a panel. The remaining panels move aside live and the new order is sent to the players.
- Actor layout strategies: the module setting "Visual Novel actors: Layout strategy" chooses how actors are arranged in the Visual Novel overlay: "Row" (as before), "Alternating left and right", "Speaker in the middle, others at the sides", "Semicircle" and "Overlapping stack". Changes glide smoothly in every strategy.
- Each layout strategy in the module settings has a short explanation in the tooltip of its option.
- The Director's handout list marks every displayed handout. Clicking a displayed handout again, its new close button or a right-click closes it, like the actors in the carousel.

### Changed

- The former on/off switch for the comic layout is migrated into the handout layout strategy ("Comic panels") and no longer appears in the settings.
- When a handout is closed, the remaining handouts rearrange themselves in the comic layout.
- The layout settings are grouped in their own section "Handouts: comic layout" and next to the actor image height.

### Fixed

- Journal Viewer: the quotation mark pattern for detecting direct speech is corrected.

## [0.15.0] - 2026-11-06

### Added

- Module setting "Maximum paragraphs per direct speech" (default 3, 1 to 10) limits over how many consecutive paragraphs a direct speech is detected.

### Changed

- Journal Viewer: direct speech is now detected across line breaks and across several paragraphs, up to the configured maximum.

## [0.14.1] - 2026-11-05

### Changed

- Journal Viewer: the page badge carousel is replaced by a combobox with the pages of the journal. The text size buttons sit to the right of it.

### Fixed

- Journal Viewer: the text size buttons are shown again and keep the chosen size when switching pages.

## [0.14.0] - 2026-11-05

### Added

- Journal Viewer: a second button next to the read-aloud button of a read-aloud section, and a context menu entry on that button and on selected text, send the text directly to the narrator line without going through the input field. With voice output possible, the text is also read aloud with `/narrate` through Talking Actors.

### Changed

- Narrator lines: the part of the text that is already shown is centered vertically, so the first line or paragraph appears in the middle. Then the text scrolls as before. Short texts that fit completely end vertically centered, longer texts end at the bottom of the narrator bar.
- The buttons of read-aloud sections in the Journal Viewer are more transparent and become clearly visible only on hover.

## [0.13.1] - 2026-11-05

### Fixed

- The hover zone of the character sheet dock no longer blocks clicks in the bottom left third of the canvas, for example on the voice toggle of the dialogue controls. The dock now reacts to the pointer without covering the controls and does not open over the Director's actor bar.

## [0.13.0] - 2026-11-05

### Added

- Talking Actors stage directions: a leading `(…)` in a dialogue or narrator line is passed on to `/talk` and `/narrate` and is not shown on the canvas.
- Journal Viewer: when direct speech or a selection is directly preceded by a text in parentheses and voice output is possible (dialogue system and voice on, canvas released to the players, Talking Actors active), a second button behind the speech and an extra context menu entry transfer the text together with the stage direction.
- Journal Viewer: right-clicking the dialogue buttons opens the context menu.

### Changed

- The Talking Actors read-aloud button and context menu are hidden in the Journal Viewer, which has its own read-aloud controls.

## [0.12.0] - 2026-11-05

### Added

- Journal Viewer: while the dialogue system is active, a button behind each direct speech (German, English and French quotation marks) sends the quoted text, without the quotation marks, to the dialogue input.

## [0.11.1] - 2026-11-05

### Changed

- The canvas overlay and the dock now live in a single layer container below Foundry's windows and the Dice So Nice canvas, so dialogs, sheets and dice are shown above them without per-window adjustments. Roll toasts stay on top of everything.
- The **Offer Character Sheets** module setting is marked as experimental and is disabled by default.

### Fixed

- Roll dialogs of game systems (Pathfinder 2e roll modifiers, Call of Cthulhu 7e roll dialog) are shown above the canvas.
- The Dice So Nice canvas is shown above the narrative canvas.

## [0.11.0] - 2026-11-04

### Added

- Roll toasts: while the canvas is shown, rolls of actors appear as a chat card in the bottom right corner for 8 seconds (paused while hovered). Visibility follows the roll mode, and with Dice So Nice the card appears once the dice have settled.
- Module setting **Offer Character Sheets** to enable or disable the character sheet dock altogether.
- Director toolbar button for the GM to block or release character sheets for players during play. Blocking closes the sheets that players opened on the canvas on all clients; the GM can always show character sheets.
- System adapters (`scripts/systems/`) that gather game-system specific behavior in one place, with adapters for Pathfinder 2e and Call of Cthulhu 7e. A new system needs only a new adapter class.

### Changed

- Journal read-aloud classes are provided by the system adapters.

### Fixed

- Character sheets of ApplicationV1 systems (Pathfinder 2e) no longer fail to open on the canvas and are shown above it.
- The token dock no longer appears by itself after character sheets are released.

## [0.10.0] - 2026-11-04

### Added

- Character sheet dock: moving the mouse to the bottom edge (about 100 px) of the left third of the canvas slides in the tokens of player characters. The GM sees all of them, players only the characters they own.
- Clicking a token opens that character's sheet centered above the canvas and its overlays; clicking it again closes it. Only one character sheet is open at a time.
- The dock hides 2 seconds after the pointer leaves the area. It stays visible while a sheet is open, and the token of the open sheet is highlighted.

## [0.9.1] - 2026-11-04

### Changed

- The hold time settings (base duration plus time per visible line) now apply to dialogue lines of actors as well as to narrator lines, replacing the fixed hold time of dialogue lines. The settings are labeled accordingly.

## [0.9] - 2026-11-04

### Added

- Module settings to choose whether dialogue and narrator text is revealed character by character, line by line or paragraph by paragraph (separately for each).
- Module settings for dialogue and narrator text sizes (100% is the theme's font size plus one third), the narrator line's maximum height (66% of the canvas height), reveal speed of dialogue text, reading speed of narrator text, scroll speed, and the narrator's hold time (base duration plus time per visible line).
- The speed slider in the input area is now a multiplier from ×0.5 to ×5 that scales reveal speed and, more gently, scroll speed. Changing it also adjusts the line that is currently being shown, for all clients.
- Dialogue lines have a maximum height (about four lines for actors, 66% of the canvas height for the narrator). Longer text scrolls smoothly with ease-in and ease-out so that it reaches the end when the last line is written, before the hold time starts.
- A short pause follows each paragraph of dialogue and narrator text; its length depends on the reading or writing speed.

### Changed

- Narrator lines are vertically centered on the screen and fade in line by line at a comfortable reading speed instead of as a whole. Their hold time counts only the lines that are visible at the end.
- Only one dialogue or narrator line is shown at a time: the send button and Enter stay locked until the current line has completely faded out.

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
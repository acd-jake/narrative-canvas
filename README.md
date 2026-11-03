# Narrative Canvas

Narrative Canvas provides a Theatre of the Mind stage for Foundry Virtual Tabletop. Game Masters prepare reusable scenes, then use the **Director Controls** displayed on their Narrative Canvas to present backgrounds, handout images, actors, dialogue, and audio.

## Requirements

- Foundry Virtual Tabletop 14.
- No specific game system is required.

## Installation

### Install through Foundry

1. In Foundry Setup, open **Add-on Modules** and select **Install Module**.
2. Enter the manifest URL published by the project maintainer and install the module.
3. In the world, open **Manage Modules**, enable **Narrative Canvas**, and reload if prompted.

### Install manually

Download or clone the repository into Foundry's `Data/modules` directory. The installed `narrative-canvas` folder must contain `module.json` at its root.

## Quick start

1. As a GM, select **Narrative Scene Configurator** from Token Controls. Create a scene and add its backgrounds, handout images, actors, and audio.
2. Select **Narrative Canvas** in Token Controls to open the stage with the GM's **Director Controls**.
3. Choose a scene and prepare the presentation using the Director Controls.
4. Select **Publish to Players** when the stage is ready. The stage is synchronized to players while it is published.
5. Players can close the stage on their own client with the X button in its upper-right corner. This does not unpublish the stage for anyone else. While the GM's publication is active, players can reopen it from Token Controls.
6. If a player has closed their local view, the GM can select **Reopen Narrative Canvas for players** in the Director Controls. This reopens the stage only for clients that had closed it.

## Scene Configurator

The Scene Configurator is GM-only. Its scene list is on the left; the workspace contains the selected scene's assets. Create, rename, and remove scenes there. Removing an image from a scene does not delete the file from disk.

### Free and journal-coupled modes

Open the Scene Configurator from Token Controls without an open Journal Entry to use it as a free-floating window. In this mode, the scene list includes all scenes, and you can move or resize the window independently.

To work alongside a journal, open its Journal Entry sheet before opening the Scene Configurator. The Configurator docks to the right of that sheet and follows it when it moves or resizes. Its scene list is filtered to scenes linked to that journal; scenes linked to other journals and free scenes are not shown. A **Journal Assets** shelf appears at the bottom with actors and images referenced by the open journal, which you can drag into a scene.

When the journal sheet closes, the Configurator undocks and returns to its previous free position and scene selection. You can also switch the Configurator to another open journal by activating that journal's sheet.

### Backgrounds and handout images

- **Background Images** fill the stage behind actors and dialogue. Selecting one replaces the current background.
- Mark one background image with **View Automatically** to use it whenever its scene is activated.
- **Handout Images** appear as foreground overlays. Several can be open at once. Select or drag an image to bring it forward; drag it to reposition it. Images can be moved partly beyond the stage edge and are not resized by dragging.
- Use the resize handle to change an image's size. The close and resize buttons keep a fixed screen size as the image is resized.
- Use the X button to close one handout image without closing the others.
- Add image files with the plus button. Supported journal images can also be dragged from the Journal Assets shelf into either image list.
- Drag an image tile between the Background Images and Handout Images lists to change its role. Its description settings move with it.

Each image can have a rich-text description. The eye or caption control determines whether its description is shown during presentation. Background descriptions appear near the top of the stage; handout descriptions appear over the image.

### Actors and audio

- Drag Actor documents anywhere into the Scene Configurator workspace. They are added to **Stage Actors**, and their image and name are saved with the scene.
- Use actor controls to show or hide a nameplate, set the active speaker, or remove an actor from the stage.
- Drag Playlist Sound documents anywhere into the Scene Configurator workspace. They are added to **Scene Audio**. You can also select **Add Audio** to choose a sound file.
- Mark one audio entry or one playlist for automatic playback when its scene is activated. Only one audio entry or playlist can be selected per scene.
- Use track controls to play, pause, or stop audio. Track and master volume are adjustable in the Director Controls.

## Journal integration

Open a Journal Entry sheet, then open the Scene Configurator to dock it beside the journal. The editor filters scenes linked to that journal. Its **Journal Assets** shelf lists actors and images referenced by the journal; drag them into a scene to add independent scene entries.

The Journal Viewer in the Director Controls can also show an image directly from a journal page without adding it to a scene. Select the image's overlay control to show it on the stage. Journal images use the same foreground behavior as handouts and are synchronized while the stage is published.

## Use the Narrative Canvas

The Narrative Canvas is the presentation stage. The GM's Director Controls are displayed on it and include a status badge indicating whether the presentation is being prepared or is live. Selecting a scene updates the available assets; it does not automatically replace the current background or close open handouts.

When a Journal Viewer selection filters out the active scene, the first visible scene is activated automatically. Uncheck **Auto-activate first scene** in the scene-selection controls to disable this behavior.

Select one of the previously created scenes to define which actors, background images, handout images, and audio tracks are available in the Director Controls. If no scene is active, Narrative Canvas uses the journal currently selected in the Journal Viewer as an asset source where possible: actors and images referenced by that journal are available, but this fallback does not provide background images or audio tracks.

When a scene is activated, its **View Automatically** background replaces the current background. Its selected automatic audio entry starts playback; if a playlist is selected, Foundry plays that playlist using its configured playback order and mode. A scene can have at most one automatic background and one automatic audio selection.

The **Activation Permission Role** setting defines the minimum user role allowed to activate Narrative Canvas. The GM uses the Director Controls to put scene elements on the stage and change or remove them; players cannot manipulate those presentation elements. While the stage is published, changes to backgrounds, handout images, actors, dialogue, and audio are synchronized to players with the view open. A player's local close action affects only that player's client.

### Preparation and live presentation

- **Preparation (PREPARING):** The Narrative Canvas is open for the GM as a preview, with Director Controls available. Players do not see the stage. Use this mode to choose a scene and arrange its backgrounds, handouts, actors, dialogue, and audio.
- **Live (LIVE):** Select **Publish to Players** to show the current stage to players. Changes made through the Director Controls are synchronized while it is published. Players who close their own view can reopen it without changing the publication state for anyone else.

Select **Hide from Players** to return from Live to Preparation: player views close while the GM's Narrative Canvas remains open. Publishing again shows the current presentation.

### Stage actions

- **Publish to Players** makes the stage visible to players.
- **Hide from Players** closes player views while leaving the Narrative Canvas and its Director Controls open. Publish again to show the stage.
- **Reopen Narrative Canvas for players** reopens the stage on clients where a player used the local close button. Players who still have it open are unaffected.
- **Stop All Audio** stops scene playback.
- **Mute Audio** silences active and future scene audio until unmuted. Unlike Stop All Audio, it does not stop scene tracks.
- **Close All Handouts** closes all open handout images.
- **Reset Background** clears the current background.
- **Turn Off Canvas** closes the Narrative Canvas for all clients. Use Token Controls to open it again.

### Backgrounds and handout images

Use the image controls on the right side of the Narrative Canvas. Select a background tile to replace the current stage background. The file-picker button can select a background that is not in the active scene. Use an image's caption control to show or hide its description.

Select a handout tile to display that image as a foreground overlay. Selecting an already open handout brings it forward; additional handouts can be open at the same time. Drag an overlay to reposition it, including partly beyond the stage edge. Dragging does not resize it. Use its resize handle to change its size, or its X button to close it. The buttons retain their screen size while the image is resized.

### Audio

The Audio section in the Director Controls lists the active scene's tracks. Use each track's play/pause and stop buttons to control playback. The track volume slider changes that track; the master volume slider changes the overall audio level. Currently playing or paused scene audio appears below the master-volume control with a pause/resume button. Playlist entries reflect Foundry's actual playing or paused state there as well as in the track list. The toolbar's **Stop All Audio** action stops scene tracks and automatic playlists. **Mute Audio** silences playback without stopping scene tracks.

### Visual Novel overlay

The actor carousel along the bottom controls the characters shown in the Visual Novel overlay. Select an actor card to add that actor to the stage or remove it. Right-clicking an actor card also removes it.

- Use the speech-bubble control to set or clear the active speaker. The active speaker receives the configured highlight; other staged actors are dimmed while a speaker is active.
- Use the nameplate control to show or hide that actor's name beneath their image.
- The remove control on a staged actor removes only that actor from the overlay.

The active speaker highlight is separate from the dialogue panel: the highlight marks a staged actor, while a displayed dialogue has its own speaker name, optional portrait, and text.

## Settings

Open **Configure Settings** and find Narrative Canvas under Module Settings:

- **Activation Permission Role:** Sets the configured minimum role for module activation. Players can open the stage only while the GM has published it.
- **Canvas Background Color:** Sets the stage color visible where no image covers the background.
- **Default Background Image:** Optional fallback used when no scene background is selected.
- **Actor Image Height:** Sets actor image height relative to the stage.
- **Active Speaker Highlight Color:** Sets the highlight color for the active speaker.
- **Journal Viewer Root Folder:** Limits the Journal Viewer in the Director Controls to a folder and its subfolders.
- **Enable Toast Notifications:** Controls player notifications when the stage opens or closes.
- **Fade Duration:** Sets transition duration in milliseconds; `0` disables fades.

The Scene Configurator's tile-size slider is saved locally per user and does not change other users' tile sizes.

## Troubleshooting

- **Players cannot open the stage:** Confirm the GM has selected **Publish to Players**. The player control remains disabled while the stage is unpublished.
- **A player closed their view:** The player can reopen it from Token Controls while the stage is published, or the GM can use **Reopen Narrative Canvas for players** in the Director Controls.
- **An image is missing from a scene:** Add it to the active scene's Background Images or Handout Images list. Selecting a background from the file picker does not automatically add it to the scene.
- **A description is missing:** Confirm it has been saved in the description editor and that its visibility control is enabled.
- **Scenes linked to a journal are missing:** Open the journal before opening the Scene Configurator and check the journal filter.
- **Changes are not reaching players:** Confirm the stage is published and the canvas is active. Hiding the player view is different from turning off the canvas.

## Data and localization

Scene definitions and their assets are stored in the world's Narrative Canvas settings. A subset of the GM's active presentation state is saved so the scene, background, handout overlays, and staged actors can be restored. Removing an image from a scene does not remove its file from storage.

The module includes English and German translations. Foundry's language setting determines the interface language.
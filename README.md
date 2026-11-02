# Narrative Canvas

Narrative Canvas provides a Theatre of the Mind stage for Foundry Virtual Tabletop. Prepare reusable scenes, then present backgrounds, Handoutimages, actors, dialogue, and audio from one Director interface.

## Requirements

- Foundry Virtual Tabletop 14.
- No specific game system is required.
- Scene creation and editing are GM-only. The activation permission setting can allow other roles to activate the canvas.

## Installation

### Install through Foundry

1. In Foundry Setup, open **Add-on Modules** and choose **Install Module**.
2. Enter the manifest URL published by the project maintainer and install the module.
3. In the world, open **Manage Modules** and enable **Narrative Canvas**.

Use the manifest URL from the project's release or repository. A development copy may contain a build-time placeholder instead.

### Install manually
Narrative Canvas adds a Theatre of the Mind stage to Foundry Virtual Tabletop. Game Masters prepare reusable narrative scenes, then use the Director to present backgrounds, handout images, actors, dialogue, and audio. Players see the stage only while it is published to them.

This guide covers installation, scene preparation, live operation, journal integration, settings, and common problems.

## Contents

- [Requirements and installation](#requirements-and-installation)
- [Start a session](#start-a-session)
- [Prepare scenes](#prepare-scenes)
- [Use the Journal integration](#use-the-journal-integration)
- [Run the Director](#run-the-director)
- [Configure the module](#configure-the-module)
- [Troubleshooting](#troubleshooting)
- [Data and localization](#data-and-localization)
1. Download or clone the repository.
## Requirements and installation
3. Restart Foundry, open the world, and enable **Narrative Canvas** in **Manage Modules**.

The installed folder must contain `module.json` at its root.

## First Use
The installed folder must contain `module.json` at its root. After installation, enable Narrative Canvas in the world's **Manage Modules** dialog and reload the world if Foundry asks you to do so.
1. As a GM, open the **Token Controls** toolbar and select **Open Scene Editor**.
## Start a session
3. Add images to the **Background Images** or **Handout Images** list with the plus button. Add actors and audio by dragging supported Foundry documents into their sections.
1. As a GM, open **Token Controls** and select **Open Scene Editor**.
2. Create a scene with the plus button, give it a name, and add the assets needed for the session. See [Prepare scenes](#prepare-scenes) for details.
3. Select **Enable Narrative Canvas** in Token Controls. This opens the Director for the GM.
4. Choose a scene in the Director sidebar and add the desired images, actors, dialogue, and audio to the stage.
5. Select **Publish to Players** when the presentation is ready. Make changes in the Director while preparing or presenting; updates are synchronized to players while the canvas is active.
## Scene Editor
The Director is the GM's control view. Its status badge indicates whether the presentation is being prepared or is live. **Hide from Players** removes the stage from players while keeping the Director open. **Turn Off Canvas** closes the canvas for all clients. Hiding and turning off the canvas are different actions.
Scenes and their contents are stored in the world's Narrative Canvas settings. The editor's left column contains the scene list; the workspace contains the selected scene's assets.
## Prepare scenes
### Background Images and Handout Images
Scenes are reusable collections of assets. The Scene Editor's left column lists scenes; the workspace shows the contents of the selected scene. Select a scene in the list to edit it, or use the plus button to create one. Rename a scene from its title field. Use the trash button on a scene to remove it and its scene configuration.

The editor can be opened as a free-floating window. If it is opened while a Journal Entry sheet is active, it docks beside that journal and filters the scene list to scenes linked to it. Closing the journal releases the editor to its previous free position. The tile-size slider changes the editor's image tiles and is saved for the current user.
- Add an image with the plus button in the corresponding list. The file picker accepts image files.
- Drag an image tile from one list to the other to change its role. Its description and visibility setting move with it.
- Use the trash button on a tile to remove it from the scene. This does not delete the file from disk.
Add files with the plus button in the corresponding image list. The file picker accepts image files. You can also drag supported journal images from the docked journal's **Journal Assets** shelf into either list.

The two lists serve different purposes:

- **Background Images** fill the stage behind actors and dialogue. Selecting one replaces the current background.
- **Handout Images** appear as foreground overlays. Several can remain open at once. Click or drag an image to bring it to the front, drag it to reposition it, and use its X button to close only that image.

Click and drag a tile between the two editor lists to change its role. The image's description and description-visibility setting move with it. Removing a tile from a scene does not delete the underlying file from disk.

The Director outlines the selected background or handout tile. Backgrounds and handout images can be displayed at the same time. A handout tile can be clicked again to bring its already-open image forward.
### Image Descriptions

Each image tile has a comment icon. Its tooltip shows the saved description, if present; click it to open the ProseMirror editor. The editor supports rich text and Foundry text enrichment, including document links. Close the popup to save the text.
Each image tile has a comment control for its description. Its tooltip previews the saved text, if present. Select it to open the ProseMirror editor, enter or edit the description, then close the editor to save. Rich text and Foundry text enrichment, including document links, are supported.
The eye button next to the comment icon controls whether the description is presented:
Use the eye control next to the description control to decide whether that text appears during presentation:
- Background descriptions appear near the top of the canvas like subtitles.
- Background descriptions appear near the top of the stage, like subtitles.
- Handout Image descriptions appear over the lower edge of that image.
Description visibility is independent for every image. The Director also has a caption button on each image tile for changing this setting while presenting.
Visibility is configured independently for every image. You can change it in the Scene Editor or with the caption control on a Director image tile. The displayed description updates when this setting changes.
### Actors and Audio

- Drag Actor documents into **Stage Actors**. The actor image and name are saved with the scene.
- Drag Actor documents into **Stage Actors**. The scene stores the actor image and name used by the presentation.
- Use the actor tile's name control to choose whether its nameplate is shown on stage.
- Drag Playlist Sound documents into **Scene Audio**, or select **Add Audio** to choose a sound file.
- Drop a supported asset onto the empty workspace to create a scene for it. When the editor is docked to a journal, the new scene is linked to that journal.
## Journal Integration
## Use the Journal integration
When a Journal Entry sheet is open while the Scene Editor opens, the editor docks beside it. The editor's scene list is filtered to scenes linked to that journal. Close the journal to release the editor back to its previous free position.
Open a Journal Entry sheet, then open the Scene Editor. The editor docks beside the journal and shows scenes linked to it. The **Journal Assets** shelf at the bottom lists actors and images referenced by the journal's pages. Drag an actor into **Stage Actors**, or an image into **Background Images** or **Handout Images**. The scene keeps its own asset entry; adding an asset does not make the scene dependent on the source journal. Close the journal to undock the editor.
While docked, the bottom **Journal Assets** shelf lists actors and images referenced by the journal's pages. Drag an actor into **Stage Actors** or an image into either image list. References are collected from the journal pages; images and actors already in a scene remain independent of the source journal.
### Show an image from a journal page

The Director's Journal Viewer is separate from the editor's asset shelf. Use it to display an image directly from a journal page without first adding it to a scene:
The Director's Journal Viewer is separate from the asset shelf:
1. Open or expand the Director's left sidebar.
2. Optionally choose a folder or enter search text, then select a journal and page.
3. Select the overlay icon on an image in the page to show it on the stage.
4. Select the image again to bring it forward. Drag it to reposition it, or use its X button to close it without closing other images.

Journal images use the same foreground overlay behavior as scene handouts. Opening or closing them is synchronized to players while the canvas is published.
4. Use the X button at the image's upper-right corner to close it. The close action is synchronized to players when the canvas is published.
## Run the Director
## Director
### Select a scene and its images
### Scene and image selection
The left sidebar filters and selects scenes and contains the Journal Viewer. Select a scene to load its background, handout, and actor choices into the Director panel. Selecting a different scene changes the available choices; it does not by itself replace the current stage background or close open handout overlays.
The left sidebar filters and selects scenes and contains the Journal Viewer. Selecting a scene updates the actor and image lists in the Director panel.
- Select a tile under **Background Images** to set the current stage background.
- Select a tile under **Handout Images** to open its foreground image. Open additional tiles to show multiple images together.
- Select a description/caption control to show or hide that image's description. This does not open or close the image.
- Use the background image picker to display a file that has not been added to the active scene.
- The image picker button can set a background file that is not yet in the scene's image list.

### Actors
The actor carousel displays actors belonging to the active scene. Select an actor to add it to the stage; select it again to remove it. Use the actor controls to set or clear the active-speaker highlight and to show or hide the actor's nameplate. Right-click an actor to remove it from the stage.
The actor carousel displays actors belonging to the active scene. Click an actor to add it to or remove it from the stage. Use the actor controls to select the active speaker, toggle its nameplate, or remove it. Right-clicking an actor also removes it from the stage.
### Display dialogue
### Dialogue and stage controls
Enter a speaker name and dialogue text in the Director panel. Add a portrait if desired, then select **Display Dialogue**. The dialogue appears on the stage alongside its background, actors, and handout images. Triggering new dialogue replaces the current dialogue display.
Enter a speaker name, optional portrait, and dialogue text in the Director panel, then choose **Display Dialogue**. Use **Reset Stage Content** to clear the current presentation, including its background, Handoutimage, actors, dialogue, handout, and Journal Viewer image. The journal and scene data are not deleted.
### Control audio
### Audio and visibility
Use the scene audio controls to play, pause, or stop the available tracks. Track volume controls an individual track; master volume controls the overall scene audio. A scene can have its own set of tracks.

### Publish, hide, reset, and turn off

- **Publish to Players** makes the current stage visible to players. Changes made while published are synchronized.
- **Hide from Players** hides the stage from players but leaves the Director open so you can continue preparing.
- **Reset Stage Content** clears the current presentation: background, handout images, staged actors, dialogue, handout, and journal image. It does not delete scenes or their assets.
- **Turn Off Canvas** closes the canvas for all clients. Use **Enable Narrative Canvas** in Token Controls to open the Director again.
Use the audio controls to play, pause, or stop scene tracks. Track and master volume are adjustable in the Director. **Publish to Players** shares the current stage; **Hide from Players** hides it while keeping the Director active.
## Configure the module
## Settings
Open the world's **Configure Settings** page and find Narrative Canvas under Module Settings:
Open the world's **Configure Settings** page and find the Narrative Canvas settings:
- **Activation Permission Role:** Minimum role allowed to activate the canvas. The default is Gamemaster. Scene editing remains GM-only.
- **Canvas Background Color:** Color visible where no image covers the stage. The default is black.
- **Default Background Image:** Optional fallback background used when no active scene background is selected.
- **Enable Toast Notifications:** Controls player notifications when narrative mode starts or ends.
- **Fade Duration:** Transition duration in milliseconds. The default is `500`; set it to `0` for immediate transitions.
- **Fade Duration:** Duration in milliseconds for stage and image transitions. Defaults to `500`; set to `0` for immediate changes.
The Scene Editor's tile-size slider is saved locally for each user. It is not a world setting and does not change tile sizes for other users.
The editor tile-size slider is saved locally per user and is not part of the world settings menu.
## Troubleshooting
## Troubleshooting
- **Players cannot see the stage:** Confirm the canvas is enabled and **Publish to Players** is active. The Director can remain open while the player view is hidden.
- **The Director is open, but the stage is not visible to players:** Check the player-visibility control; opening the Director does not automatically publish the stage.
- **An image is missing from the Director:** Add it to the active scene's **Background Images** or **Handout Images** list. A background chosen with the file picker does not automatically become a scene asset.
- **A description is missing:** Open the image's description editor to confirm text has been saved, then check its eye/caption visibility control.
- **Scenes linked to a journal are missing:** Open the intended Journal Entry sheet before opening the Scene Editor. Confirm that the scenes are linked to that journal and that the journal filter is not hiding them.
- **An actor or audio track is unavailable:** Confirm it was added to the active scene in the Scene Editor and that the correct scene is selected in the Director.
- **Updates are not reaching players:** Confirm the stage is published and that the canvas is still active. Hiding the player view is different from turning off the canvas.
- **The stage closes for players after a GM disconnects:** The active GM must reconnect and reopen the canvas; the module may notify players that the presentation ended.
- **Changes do not appear for players:** Check that the canvas is published; Director changes are synchronized while the canvas is active.

## Data and Localization
Scene definitions and their assets are stored in the world's Narrative Canvas settings. A subset of the GM's active presentation state is saved so the scene, background, selected scene handout, and staged actors can be restored. Journal images opened directly in the Director are presentation overlays, not scene assets. Removing an image from a scene does not remove its file from storage.

When scenes are loaded, legacy images previously marked for journal display are migrated into the **Handout Images** list.
Scene data is stored in world settings. Active presentation state is also stored so the GM's current scene and selections can be restored. Legacy images previously marked for journal display are migrated into the **Handout Images** list when scenes are loaded.

The module includes English and German translations. Foundry's language setting determines the interface language.

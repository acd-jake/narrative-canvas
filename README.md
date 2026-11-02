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

1. Download or clone the repository.
2. Copy the `narrative-canvas` folder into Foundry's `Data/modules` directory.
3. Restart Foundry, open the world, and enable **Narrative Canvas** in **Manage Modules**.

The installed folder must contain `module.json` at its root.

## First Use

1. As a GM, open the **Token Controls** toolbar and select **Open Scene Editor**.
2. Create a scene with the plus button. When the editor is opened with a Journal Entry sheet, it docks beside that journal and filters the scene list to scenes linked to it. Otherwise, it opens as a centered, free-floating window.
3. Add images to the **Background Images** or **Handout Images** list with the plus button. Add actors and audio by dragging supported Foundry documents into their sections.
4. Select **Enable Narrative Canvas** in Token Controls to open the Director.
5. Select a scene in the Director sidebar, then click an image in either image list to display it. Use **Publish to Players** when the stage is ready to share.

The Director is the GM's control view. **Hide from Players** hides the stage from players without closing the Director. **Turn Off Canvas** closes the canvas for all clients.

## Scene Editor

Scenes and their contents are stored in the world's Narrative Canvas settings. The editor's left column contains the scene list; the workspace contains the selected scene's assets.

### Background Images and Handout Images

- Add an image with the plus button in the corresponding list. The file picker accepts image files.
- Drag an image tile from one list to the other to change its role. Its description and visibility setting move with it.
- Use the trash button on a tile to remove it from the scene. This does not delete the file from disk.
- Drag supported journal images from the docked journal's asset shelf into either image list.
- Use the tile-size slider to resize the editor's image tiles. The value is saved for the current user.

Background images fill the canvas. Handout Images are shown as foreground images over the canvas. A scene can have both kinds selected in the Director at the same time.

### Image Descriptions

Each image tile has a comment icon. Its tooltip shows the saved description, if present; click it to open the ProseMirror editor. The editor supports rich text and Foundry text enrichment, including document links. Close the popup to save the text.

The eye button next to the comment icon controls whether the description is presented:

- Background descriptions appear near the top of the canvas like subtitles.
- Handout Image descriptions appear over the lower edge of the image.

Description visibility is independent for every image. The Director also has a caption button on each image tile for changing this setting while presenting.

### Actors and Audio

- Drag Actor documents into **Stage Actors**. The actor image and name are saved with the scene.
- Use the actor tile's name button to enable or disable its nameplate on the stage.
- Drag Playlist Sound documents into **Scene Audio**, or use **Add Audio** to choose a sound file.
- Dropping a supported asset onto the empty workspace creates a scene for it. If the editor is docked to a journal, the new scene is linked to that journal.

## Journal Integration

When a Journal Entry sheet is open while the Scene Editor opens, the editor docks beside it. The editor's scene list is filtered to scenes linked to that journal. Close the journal to release the editor back to its previous free position.

While docked, the bottom **Journal Assets** shelf lists actors and images referenced by the journal's pages. Drag an actor into **Stage Actors** or an image into either image list. References are collected from the journal pages; images and actors already in a scene remain independent of the source journal.

The Director's Journal Viewer is separate from the asset shelf:

1. Open or expand the left Director sidebar.
2. Optionally filter by folder or search text, then select a journal and page.
3. Click the overlay icon on an image in the page to display it using the same Handoutimage overlay used by the scene's **Handout Images** list.
4. Use the X button at the image's upper-right corner to close it. The close action is synchronized to players when the canvas is published.

## Director

### Scene and image selection

The left sidebar filters and selects scenes and contains the Journal Viewer. Selecting a scene updates the actor and image lists in the Director panel.

- Click a tile under **Background Images** to set the canvas background.
- Click a tile under **Handout Images** to display it as a foreground image.
- The active tile is outlined. Backgrounds and Handout Images can be shown at the same time.
- Click the caption button on a tile to toggle that image's description. The image itself remains selected.
- The image picker button can set a background file that is not yet in the scene's image list.

### Actors

The actor carousel displays actors belonging to the active scene. Click an actor to add it to or remove it from the stage. Use the actor controls to select the active speaker, toggle its nameplate, or remove it. Right-clicking an actor also removes it from the stage.

### Dialogue and stage controls

Enter a speaker name, optional portrait, and dialogue text in the Director panel, then choose **Display Dialogue**. Use **Reset Stage Content** to clear the current presentation, including its background, Handoutimage, actors, dialogue, handout, and Journal Viewer image. The journal and scene data are not deleted.

### Audio and visibility

Use the audio controls to play, pause, or stop scene tracks. Track and master volume are adjustable in the Director. **Publish to Players** shares the current stage; **Hide from Players** hides it while keeping the Director active.

## Settings

Open the world's **Configure Settings** page and find the Narrative Canvas settings:

- **Activation Permission Role:** Minimum role permitted to activate the canvas. Defaults to Gamemaster. Scene editing remains GM-only.
- **Canvas Background Color:** Fallback color visible when no image covers the stage. Defaults to black.
- **Default Background Image:** Optional fallback image used when no scene background is selected.
- **Enable Toast Notifications:** Show player notifications when narrative mode starts or ends.
- **Fade Duration:** Duration in milliseconds for stage and image transitions. Defaults to `500`; set to `0` for immediate changes.

The editor tile-size slider is saved locally per user and is not part of the world settings menu.

## Troubleshooting

- **Players do not see the stage:** Confirm that the canvas is enabled and **Publish to Players** is active.
- **An image is not in the Director list:** Add it to the active scene's **Background Images** or **Handout Images** list in the Scene Editor.
- **The description is not shown:** Check the image's eye/caption setting and ensure that the correct image list is selected.
- **A journal's scenes are not shown in the editor:** Confirm that the editor is docked to the intended Journal Entry sheet and that those scenes are linked to that journal.
- **Changes do not appear for players:** Check that the canvas is published; Director changes are synchronized while the canvas is active.

## Data and Localization

Scene data is stored in world settings. Active presentation state is also stored so the GM's current scene and selections can be restored. Legacy images previously marked for journal display are migrated into the **Handout Images** list when scenes are loaded.

The module includes English and German translations. Foundry's language setting determines the interface language.

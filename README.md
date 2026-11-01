# Narrative Canvas

Narrative Canvas adds a Theatre of the Mind presentation mode to Foundry VTT. Build reusable narrative scenes with backgrounds, actors, and audio, then present the canvas to players while you control it from the GM interface.

## Features

- Create and manage narrative scenes.
- Add background images, actors, and audio tracks to scenes.
- Display actors and dialogue on the canvas.
- Browse journal entries from the director sidebar and show journal images as canvas overlays.
- Control scene audio and canvas visibility for players.
- Configure activation permissions, a default background, canvas background color, and player notifications.

## Requirements

- Foundry Virtual Tabletop 14. The module manifest currently declares version 14 as its minimum and verified version.
- No particular game system is required by the module manifest.

## Installation

### Install through Foundry VTT

1. Open Foundry Setup and go to **Add-on Modules**.
2. Select **Install Module**.
3. Enter the module manifest URL published by the project maintainer, then select **Install**.
4. In your world, open **Manage Modules** and enable **Narrative Canvas**.

Use the manifest URL supplied by the project's GitHub release or repository. The manifest URL in an unpackaged development copy may still be a build-time placeholder.

### Install manually

1. Download or clone this repository.
2. Copy the `narrative-canvas` folder into Foundry's `Data/modules` directory.
3. Restart Foundry VTT, open your world, and enable **Narrative Canvas** in **Manage Modules**.

The module folder should contain `module.json` at its root, for example:

```text
Data/
└── modules/
    └── narrative-canvas/
        └── module.json
```

## Getting Started

1. As a GM, open the **Token Controls** toolbar and select **Open Scene Editor**.
2. Create a scene, then add background images with the background picker. Drag Actor documents into the Actors section and Playlist Sound documents into the Audio Tracks section. Scenes and their contents are stored as module world settings.
3. Select **Enable Narrative Canvas** from the Token Controls toolbar. This opens the director canvas.
4. Select a narrative scene in the left sidebar. Use the controls on the right to choose a scene background and manage actors, dialogue, and visibility.
5. Select **Publish to Players** when you are ready for players to see the canvas. Use **Hide from Players** to hide it without closing your director view.

The canvas can also be activated by users who meet the configured activation permission. Scene editing is available to GMs.

## Journal Images

1. In the director's Journal Viewer, optionally filter by folder, then select a journal and page.
2. Select the overlay button on an image in the page to display it over the Narrative Canvas.
3. The image is limited to about 80% of the screen height, leaving the canvas background visible around it.
4. The GM can close the image with the button in its upper-right corner. Closing it also removes the overlay for players.

The canvas must be published to players for them to see its current content.

## Director Controls

- **Scene sidebar:** Filter scenes, select the active scene, and browse journals.
- **Backgrounds:** Pick a scene background from the quick list or use the background picker.
- **Actors:** Add or remove scene actors from the stage, set the active speaker, and toggle actor nameplates.
- **Dialogue:** Enter a speaker, optional portrait, and dialogue text, then display it on the canvas.
- **Audio:** Play, pause, or stop scene tracks and adjust track or master volume.
- **Reset Stage Content:** Clear the current background, actors, dialogue, handout, and image overlay.
- **Turn Off Canvas:** Shut down the canvas for all clients.

## Settings

Open the world's **Configure Settings** page and find the Narrative Canvas settings:

- **Activation Permission Role:** Minimum user role allowed to activate the canvas. The default is Gamemaster.
- **Canvas Background Color:** Fallback color shown when no background image is covering the canvas.
- **Default Background Image:** Optional fallback image used when no background is selected.
- **Enable Toast Notifications:** Show activation and deactivation notifications to players.
- **Fade Duration:** Duration in milliseconds for canvas and presentation-element fades. The default is `500 ms`; set it to `0` to disable fades.

## Localization

The module includes English and German translations. Foundry's language setting determines the displayed language.

import { NarrativeSettings } from "./settings.js";

export class NarrativeControls {
  static initialize(controls) {
    try {
      if (!game || !game.settings || !NarrativeSettings.userHasPermission()) return;
    } catch (e) { return; }

    if (controls.tokens && controls.tokens.tools) {
      // 1. Creator Scene Editor Button Configuration
      controls.tokens.tools["open-scene-editor"] = {
        name: "open-scene-editor",
        title: "NARRATIVE_CANVAS.Editor.WindowTitle",
        icon: "fas fa-book-open",
        button: true,
        visible: game.user.isGM, // Reserved strictly for Gamemasters
        onClick: () => {
          const manager = game.modules.get("narrative-canvas").manager;
          if (manager) manager.toggleEditorWindow();
        }
      };

      // 2. Existing Play-Mode Activation Button
      controls.tokens.tools["activate-canvas"] = {
        name: "activate-canvas",
        title: "NARRATIVE_CANVAS.Controls.ToggleCanvas",
        icon: "fa-solid fa-clapperboard", // Beautiful clapperboard icon for editor mode
        button: true,
        visible: true,
        onClick: () => game.modules.get("narrative-canvas").manager.toggleCanvasState(true)
      };

    }
  }
}

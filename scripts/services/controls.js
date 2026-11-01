import { NarrativeSettings } from "./settings.js";

export class NarrativeControls {
  static initialize(controls) {
    try {
      if (!game || !game.settings || !NarrativeSettings.userHasPermission()) return;
    } catch (e) { return; }

    if (controls.notes && controls.notes.tools) {
      // 1. Existing Play-Mode Activation Button
      controls.notes.tools["activate-canvas"] = {
        name: "activate-canvas",
        title: "NARRATIVE_CANVAS.Controls.ToggleCanvas",
        icon: "fa-solid fa-film",
        button: true,
        visible: true,
        onClick: () => game.modules.get("narrative-canvas").manager.toggleCanvasState(true)
      };

      // 2. NEW: Creator Scene Editor Button Configuration
      controls.notes.tools["open-scene-editor"] = {
        name: "open-scene-editor",
        title: "NARRATIVE_CANVAS.Editor.WindowTitle",
        icon: "fa-solid fa-clapperboard", // Beautiful clapperboard icon for editor mode
        button: true,
        visible: game.user.isGM, // Reserved strictly for Gamemasters
        onClick: () => {
          const manager = game.modules.get("narrative-canvas").manager;
          if (manager) manager.toggleEditorWindow();
        }
      };
    }
  }
}

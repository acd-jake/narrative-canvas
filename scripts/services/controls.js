import { NarrativeSettings } from "./settings.js";

/**
 * Intercepts and manipulates the core Foundry VTT sidebar controls.
 */
export class NarrativeControls {
  /**
   * Appends the custom action tool button into the existing V14 Scene Controls structure.
   * @param {object} controls - The existing core control structures mapping
   */
  static initialize(controls) {
    // V14 Race-Condition Fix: Wrap in a try-catch block to prevent startup crashes
    // if Foundry queries controls before the game or settings object is initialized.
    try {
      if (!game || !game.settings || !NarrativeSettings.userHasPermission()) {
        return;
      }
    } catch (error) {
      // Quietly return if game state isn't ready yet
      return;
    }

    // Safely inject our action tool button into the existing notes category
    if (controls.notes && controls.notes.tools) {
      controls.notes.tools["activate-canvas"] = {
        name: "activate-canvas",
        title: "NARRATIVE_CANVAS.Controls.ToggleCanvas",
        icon: "fa-solid fa-film",
        button: true,
        visible: true,
        onClick: () => {
          game.modules.get("narrative-canvas").manager.toggleCanvasState(true);
        }
      };
    }
  }
}

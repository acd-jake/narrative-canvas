import { NarrativeSettings } from "./settings.js";

export class NarrativeControls {
  static getSceneConfiguratorTooltipKey(isOpen) {
    return isOpen
      ? "NARRATIVE_CANVAS.Controls.CloseSceneConfigurator"
      : "NARRATIVE_CANVAS.Controls.OpenSceneConfigurator";
  }

  static initialize(controls) {
    try {
      if (!game || !game.settings || !NarrativeSettings.userHasPermission()) return;
    } catch (e) { return; }

    if (controls.tokens && controls.tokens.tools) {
      // 1. Creator Scene Editor Button Configuration
      const manager = game.modules.get("narrative-canvas").manager;
      const sceneConfiguratorTool = {
        name: "open-scene-editor",
        title: NarrativeControls.getSceneConfiguratorTooltipKey(manager?.editorApp?.rendered === true),
        icon: "fa-solid fa-clapperboard",
        button: true,
        visible: game.user.isGM, // Reserved strictly for Gamemasters
        onClick: (event) => {
          if (!manager) return;

          const wasOpen = manager.editorApp?.rendered === true;
          manager.toggleEditorWindow();
          sceneConfiguratorTool.title = NarrativeControls.getSceneConfiguratorTooltipKey(!wasOpen);
          event?.currentTarget?.setAttribute("title", game.i18n.localize(sceneConfiguratorTool.title));
        }
      };
      controls.tokens.tools["open-scene-editor"] = sceneConfiguratorTool;

      // 2. Existing Play-Mode Activation Button
      controls.tokens.tools["activate-canvas"] = {
        name: "activate-canvas",
        title: "NARRATIVE_CANVAS.Controls.OpenCanvas",
        icon: "fa-solid fa-masks-theater",
        button: true,
        visible: true,
        onClick: () => game.modules.get("narrative-canvas").manager.toggleCanvasState(true)
      };

    }
  }
}

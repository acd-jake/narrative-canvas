import { NarrativeSettings } from "./settings.js";

export class NarrativeControls {
  static setCanvasControlEnabled(isEnabled) {
    const canvasControl = document.querySelector('#scene-controls-tools [data-tool="activate-canvas"]');
    if (!canvasControl) return;

    canvasControl.disabled = !isEnabled;
    canvasControl.setAttribute("aria-disabled", String(!isEnabled));
    canvasControl.classList.toggle("disabled", !isEnabled);
  }

  static getSceneConfiguratorTooltipKey(isOpen) {
    return isOpen
      ? "NARRATIVE_CANVAS.Controls.CloseSceneConfigurator"
      : "NARRATIVE_CANVAS.Controls.OpenSceneConfigurator";
  }

  static initialize(controls) {
    if (!game || !game.settings) return;

    if (controls.tokens && controls.tokens.tools) {
      const manager = game.modules.get("narrative-canvas").manager;
      let canUseSceneEditor = false;
      if (game.user.isGM) {
        try {
          canUseSceneEditor = NarrativeSettings.userHasPermission();
        } catch (e) {}
      }

      if (canUseSceneEditor) {
        const sceneConfiguratorTool = {
          name: "open-scene-editor",
          title: NarrativeControls.getSceneConfiguratorTooltipKey(manager?.editorApp?.rendered === true),
          icon: "fa-solid fa-clapperboard",
          button: true,
          visible: true,
          onClick: (event) => {
            if (!manager) return;

            const wasOpen = manager.editorApp?.rendered === true;
            manager.toggleEditorWindow();
            sceneConfiguratorTool.title = NarrativeControls.getSceneConfiguratorTooltipKey(!wasOpen);
            event?.currentTarget?.setAttribute("title", game.i18n.localize(sceneConfiguratorTool.title));
          }
        };
        controls.tokens.tools["open-scene-editor"] = sceneConfiguratorTool;
      }

      controls.tokens.tools["activate-canvas"] = {
        name: "activate-canvas",
        title: "NARRATIVE_CANVAS.Controls.OpenCanvas",
        icon: "fa-solid fa-masks-theater",
        button: true,
        visible: true,
        disabled: !game.user.isGM && !manager?.narrativeState.playerViewActive,
        onClick: () => {
          if (game.user.isGM) {
            return manager?.toggleCanvasState(true);
          }

          return manager?.openPlayerCanvas();
        }
      };
      NarrativeControls.setCanvasControlEnabled(game.user.isGM || Boolean(manager?.narrativeState.playerViewActive));

    }
  }
}

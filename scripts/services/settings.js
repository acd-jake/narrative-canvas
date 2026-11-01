/**
 * Handles module configurations and permissions.
 */
export class NarrativeSettings {
  static SETTING_PERMISSION = "activationPermission";
  static SETTING_BG_COLOR = "canvasBackgroundColor";
  static SETTING_TOASTS = "enableToastNotifications";

  /**
   * Registers all settings within Foundry VTT.
   */
  static register() {
    game.settings.register("narrative-canvas", this.SETTING_PERMISSION, {
      name: "NARRATIVE_CANVAS.Settings.PermissionLabel",
      hint: "NARRATIVE_CANVAS.Settings.PermissionHint",
      scope: "world",
      config: true,
      type: Number,
      default: CONST.USER_ROLES.TRUSTED,
      choices: {
        [CONST.USER_ROLES.PLAYER]: "USER.RolePlayer",
        [CONST.USER_ROLES.TRUSTED]: "USER.RoleTrusted",
        [CONST.USER_ROLES.ASSISTANT]: "USER.RoleAssistant",
        [CONST.USER_ROLES.GAMEMASTER]: "USER.RoleGamemaster"
      },
      onChange: () => ui.controls.render()
    });

    game.settings.register("narrative-canvas", this.SETTING_BG_COLOR, {
      name: "NARRATIVE_CANVAS.Settings.BgColorLabel",
      hint: "NARRATIVE_CANVAS.Settings.BgColorHint",
      scope: "world",
      config: true,
      type: String,
      default: "#000000",
      onChange: () => {
        const manager = game.modules.get("narrative-canvas").manager;
        if (manager?.view) manager.view.render(manager.narrativeState);
      }
    });

    game.settings.register("narrative-canvas", this.SETTING_TOASTS, {
      name: "NARRATIVE_CANVAS.Settings.ToastsLabel",
      hint: "NARRATIVE_CANVAS.Settings.ToastsHint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
  }

  static userHasPermission() {
    const requiredRole = game.settings.get("narrative-canvas", this.SETTING_PERMISSION);
    return game.user.role >= requiredRole;
  }

  static getBackgroundColor() {
    return game.settings.get("narrative-canvas", this.SETTING_BG_COLOR);
  }

  static areToastsEnabled() {
    return game.settings.get("narrative-canvas", this.SETTING_TOASTS);
  }
}

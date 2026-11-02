import { JournalBrowser } from "./journal-browser.js";

/**
 * Handles module configurations and permissions.
 */
export class NarrativeSettings {
  static SETTING_PERMISSION = "activationPermission";
  static SETTING_BG_COLOR = "canvasBackgroundColor";
  static SETTING_DEFAULT_BG_IMAGE = "defaultBackgroundImage";
  static SETTING_TOASTS = "enableToastNotifications";
  static SETTING_FADE_DURATION = "fadeDuration";
  static SETTING_SCENES_DATA = "configuredScenesDataset";
  static SETTING_TILE_SIZE = "editorTileSize";
  static SETTING_ACTIVE_STATE = "activeNarrativeState";
  static SETTING_JOURNAL_VIEWER_STATE = "journalViewerState";
  static SETTING_JOURNAL_ROOT_FOLDER = "journalRootFolder";

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
      default: CONST.USER_ROLES.GAMEMASTER,
      choices: {
        [CONST.USER_ROLES.PLAYER]: "USER.RolePlayer",
        [CONST.USER_ROLES.TRUSTED]: "USER.RoleTrusted",
        [CONST.USER_ROLES.ASSISTANT]: "USER.RoleAssistant",
        [CONST.USER_ROLES.GAMEMASTER]: "USER.RoleGamemaster"
      }
    });

    game.settings.register("narrative-canvas", this.SETTING_BG_COLOR, {
      name: "NARRATIVE_CANVAS.Settings.BgColorLabel",
      hint: "NARRATIVE_CANVAS.Settings.BgColorHint",
      scope: "world",
      config: true,
      type: String,
      default: "#000000",
      onChange: () => {
        const manager = game.modules?.get("narrative-canvas")?.manager;
        manager?.refreshView();
      }
    });

    game.settings.register("narrative-canvas", this.SETTING_DEFAULT_BG_IMAGE, {
      name: "NARRATIVE_CANVAS.Settings.DefaultBgImageLabel",
      hint: "NARRATIVE_CANVAS.Settings.DefaultBgImageHint",
      scope: "world",
      config: true,
      type: String,
      default: "",
      filePicker: "image",
      onChange: () => {
        const manager = game.modules?.get("narrative-canvas")?.manager;
        if (manager && !manager.narrativeState.background) {
          manager.refreshView();
        }
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

    game.settings.register("narrative-canvas", this.SETTING_FADE_DURATION, {
      name: "NARRATIVE_CANVAS.Settings.FadeDurationLabel",
      hint: "NARRATIVE_CANVAS.Settings.FadeDurationHint",
      scope: "world",
      config: true,
      type: Number,
      range: { min: 0, max: 5000, step: 50 },
      default: 500,
      onChange: () => {
        const manager = game.modules?.get("narrative-canvas")?.manager;
        manager?.refreshView();
      }
    });

    game.settings.register("narrative-canvas", this.SETTING_SCENES_DATA, {
      scope: "world",
      config: false,
      type: Array,
      default: []
    });

    game.settings.register("narrative-canvas", this.SETTING_TILE_SIZE, {
      scope: "client", // Saved locally per user (GM choice)
      config: false,   // Hidden from global config menu, managed via custom slider
      type: Number,
      default: 200,    // Default size in pixels
    });

    game.settings.register("narrative-canvas", this.SETTING_ACTIVE_STATE, {
      scope: "world",
      config: false,
      type: Object,
      default: null
    });

    game.settings.register("narrative-canvas", this.SETTING_JOURNAL_VIEWER_STATE, {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });
  }

  static registerJournalRootFolder() {
    const choices = Object.fromEntries([
      ["", "NARRATIVE_CANVAS.Director.AllFolders"],
      ...JournalBrowser.getFolders().map(folder => [folder.id, folder.path])
    ]);

    game.settings.register("narrative-canvas", this.SETTING_JOURNAL_ROOT_FOLDER, {
      name: "NARRATIVE_CANVAS.Settings.JournalRootFolderLabel",
      hint: "NARRATIVE_CANVAS.Settings.JournalRootFolderHint",
      scope: "client",
      config: true,
      type: String,
      choices,
      default: ""
    });
  }

  static getAllScenes() {
    return game.settings.get("narrative-canvas", this.SETTING_SCENES_DATA);
  }

  /**
   * Persists the complete scene list.
   * @param {object[]} scenes
   */
  static async saveAllScenes(scenes) {
    await game.settings.set("narrative-canvas", this.SETTING_SCENES_DATA, scenes);
  }

  /**
   * Retrieves the current saved pixel size for the editor grids.
   * @returns {number}
   */
  static getTileSize() {
    return game.settings.get("narrative-canvas", this.SETTING_TILE_SIZE);
  }

  /**
   * Updates the persistent tile size value.
   * @param {number} size 
   */
  static async setTileSize(size) {
    await game.settings.set("narrative-canvas", this.SETTING_TILE_SIZE, size);
  }

  static userHasPermission() {
    const requiredRole = game.settings.get("narrative-canvas", this.SETTING_PERMISSION);
    return game.user.role >= requiredRole;
  }

  static getBackgroundColor() {
    return game.settings.get("narrative-canvas", this.SETTING_BG_COLOR);
  }

  /**
   * Retrieves the default canvas background image path.
   * @returns {string}
   */
  static getDefaultBackgroundImage() {
    return game.settings.get("narrative-canvas", this.SETTING_DEFAULT_BG_IMAGE) || "";
  }

  /**
   * Retrieves the persisted active narrative state (scene, background, actors, speaker).
   * @returns {object|null}
   */
  static getActiveState() {
    return game.settings.get("narrative-canvas", this.SETTING_ACTIVE_STATE);
  }

  /**
   * Persists the active narrative state.
   * @param {object} state
   */
  static async saveActiveState(state) {
    if (!game.user.isGM) return;
    await game.settings.set("narrative-canvas", this.SETTING_ACTIVE_STATE, state);
  }

  /**
   * Retrieves the current user's saved Journal Viewer state.
    * @returns {{query: string, journalId: string, pageId: string}}
   */
  static getJournalViewerState() {
    const state = game.settings.get("narrative-canvas", this.SETTING_JOURNAL_VIEWER_STATE);
    return {
      query: typeof state?.query === "string" ? state.query : "",
      journalId: typeof state?.journalId === "string" ? state.journalId : "",
      pageId: typeof state?.pageId === "string" ? state.pageId : ""
    };
  }

  /**
   * Persists the current user's Journal Viewer state locally.
   * @param {{query: string, journalId: string, pageId: string}} state
   */
  static async saveJournalViewerState(state) {
    await game.settings.set("narrative-canvas", this.SETTING_JOURNAL_VIEWER_STATE, {
      query: typeof state?.query === "string" ? state.query : "",
      journalId: typeof state?.journalId === "string" ? state.journalId : "",
      pageId: typeof state?.pageId === "string" ? state.pageId : ""
    });
  }

  /**
   * Retrieves the configured Journal Viewer root folder if it still exists.
   * @returns {string}
   */
  static getJournalRootFolder() {
    const folderId = game.settings.get("narrative-canvas", this.SETTING_JOURNAL_ROOT_FOLDER) || "";
    return JournalBrowser.getFolders().some(folder => folder.id === folderId) ? folderId : "";
  }

  static areToastsEnabled() {
    return game.settings.get("narrative-canvas", this.SETTING_TOASTS);
  }

  static getFadeDuration() {
    return game.settings.get("narrative-canvas", this.SETTING_FADE_DURATION);
  }
}

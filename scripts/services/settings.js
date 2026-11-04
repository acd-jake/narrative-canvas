import { JournalBrowser } from "./journal-browser.js";
import { ThemeCatalog } from "./themes/theme-catalog.js";

/**
 * Handles module configurations and permissions.
 */
export class NarrativeSettings {
  static #directorLayoutSaveQueue = Promise.resolve();

  static SETTING_PERMISSION = "activationPermission";
  static SETTING_BG_COLOR = "canvasBackgroundColor";
  static SETTING_DEFAULT_BG_IMAGE = "defaultBackgroundImage";
  static SETTING_ACTOR_IMAGE_HEIGHT = "actorImageHeight";
  static SETTING_THEME = "theme";
  static SETTING_TOASTS = "enableToastNotifications";
  static SETTING_FADE_DURATION = "fadeDuration";
  static SETTING_LOG_LEVEL = "logLevel";
  static SETTING_SCENES_DATA = "configuredScenesDataset";
  static SETTING_TILE_SIZE = "editorTileSize";
  static SETTING_ACTIVE_STATE = "activeNarrativeState";
  static SETTING_JOURNAL_VIEWER_STATE = "journalViewerState";
  static SETTING_DIRECTOR_LAYOUT_STATE = "directorLayoutState";
  static SETTING_JOURNAL_ROOT_FOLDER = "journalRootFolder";
  static SETTING_UNKNOWN_SPEAKER = "unknownSpeakerName";
  static SETTING_SPOKEN_TO_CHAT = "spokenDialogueToChat";
  static SETTING_READ_ALOUD_PRESET = "readAloudPreset";
  static SETTING_READ_ALOUD_CUSTOM_CLASS = "readAloudCustomClass";
  static READ_ALOUD_CLASSES = { coc7: "keeper-read-aloud", pf2e: "narrative" };
  static SETTING_DIALOGUE_SPEED = "dialogueSpeedMultiplier";
  static SETTING_DIALOGUE_TEXT_SCALE = "dialogueTextScale";
  static SETTING_NARRATION_TEXT_SCALE = "narrationTextScale";
  static SETTING_NARRATION_MAX_HEIGHT = "narrationMaxHeight";
  static SETTING_DIALOGUE_REVEAL_SPEED = "dialogueRevealSpeed";
  static SETTING_NARRATION_PARAGRAPH_SECONDS = "narrationParagraphSeconds";
  static SETTING_DIALOGUE_SCROLL_SPEED = "dialogueScrollSpeed";
  static SETTING_NARRATION_HOLD_BASE = "narrationHoldBase";
  static SETTING_NARRATION_HOLD_PER_LINE = "narrationHoldPerLine";

  static DIALOGUE_SPEED_MIN = 0.5;
  static DIALOGUE_SPEED_MAX = 5;

  /** World-wide numeric dialogue settings: [key, default, min, max, step, i18n stem]. */
  static DIALOGUE_NUMBER_SETTINGS = [
    ["dialogueTextScale", 100, 50, 200, 5, "DialogueTextScale"],
    ["narrationTextScale", 100, 50, 200, 5, "NarrationTextScale"],
    ["narrationMaxHeight", 66, 30, 90, 1, "NarrationMaxHeight"],
    ["dialogueRevealSpeed", 40, 5, 200, 5, "DialogueRevealSpeed"],
    ["narrationParagraphSeconds", 3.5, 0.5, 6, 0.1, "NarrationParagraphSeconds"],
    ["dialogueScrollSpeed", 100, 25, 400, 5, "DialogueScrollSpeed"],
    ["narrationHoldBase", 2, 0, 20, 0.5, "NarrationHoldBase"],
    ["narrationHoldPerLine", 0.8, 0, 5, 0.1, "NarrationHoldPerLine"]
  ];

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

    game.settings.register("narrative-canvas", this.SETTING_ACTOR_IMAGE_HEIGHT, {
      name: "NARRATIVE_CANVAS.Settings.ActorImageHeightLabel",
      hint: "NARRATIVE_CANVAS.Settings.ActorImageHeightHint",
      scope: "world",
      config: true,
      type: Number,
      range: { min: 10, max: 60, step: 5 },
      default: 30,
      onChange: () => {
        const manager = game.modules?.get("narrative-canvas")?.manager;
        manager?.refreshView();
      }
    });

    game.settings.register("narrative-canvas", this.SETTING_THEME, {
      name: "NARRATIVE_CANVAS.Settings.ThemeLabel",
      hint: "NARRATIVE_CANVAS.Settings.ThemeHint",
      scope: "world",
      config: true,
      type: String,
      choices: ThemeCatalog.getChoices(),
      default: ThemeCatalog.DEFAULT_THEME_ID,
      onChange: () => {
        const manager = game.modules?.get("narrative-canvas")?.manager;
        manager?.refreshView();
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

    game.settings.register("narrative-canvas", this.SETTING_LOG_LEVEL, {
      name: "NARRATIVE_CANVAS.Settings.LogLevelLabel",
      hint: "NARRATIVE_CANVAS.Settings.LogLevelHint",
      scope: "world",
      config: true,
      type: String,
      default: "warn",
      choices: {
        off: "NARRATIVE_CANVAS.Settings.LogLevels.Off",
        error: "NARRATIVE_CANVAS.Settings.LogLevels.Error",
        warn: "NARRATIVE_CANVAS.Settings.LogLevels.Warn",
        info: "NARRATIVE_CANVAS.Settings.LogLevels.Info",
        debug: "NARRATIVE_CANVAS.Settings.LogLevels.Debug",
        trace: "NARRATIVE_CANVAS.Settings.LogLevels.Trace"
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

    game.settings.register("narrative-canvas", this.SETTING_UNKNOWN_SPEAKER, {
      name: "NARRATIVE_CANVAS.Settings.UnknownSpeakerLabel",
      hint: "NARRATIVE_CANVAS.Settings.UnknownSpeakerHint",
      scope: "world",
      config: true,
      type: String,
      default: ""
    });

    game.settings.register("narrative-canvas", this.SETTING_SPOKEN_TO_CHAT, {
      name: "NARRATIVE_CANVAS.Settings.SpokenToChatLabel",
      hint: "NARRATIVE_CANVAS.Settings.SpokenToChatHint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register("narrative-canvas", this.SETTING_READ_ALOUD_PRESET, {
      name: "NARRATIVE_CANVAS.Settings.ReadAloudPresetLabel",
      hint: "NARRATIVE_CANVAS.Settings.ReadAloudPresetHint",
      scope: "world",
      config: true,
      type: String,
      default: "auto",
      choices: {
        auto: "NARRATIVE_CANVAS.Settings.ReadAloudPresets.Auto",
        coc7: "NARRATIVE_CANVAS.Settings.ReadAloudPresets.Coc7",
        pf2e: "NARRATIVE_CANVAS.Settings.ReadAloudPresets.Pf2e",
        custom: "NARRATIVE_CANVAS.Settings.ReadAloudPresets.Custom"
      },
      onChange: () => game.modules?.get("narrative-canvas")?.manager?.refreshView()
    });

    game.settings.register("narrative-canvas", this.SETTING_READ_ALOUD_CUSTOM_CLASS, {
      name: "NARRATIVE_CANVAS.Settings.ReadAloudCustomClassLabel",
      hint: "NARRATIVE_CANVAS.Settings.ReadAloudCustomClassHint",
      scope: "world",
      config: true,
      type: String,
      default: "",
      onChange: () => game.modules?.get("narrative-canvas")?.manager?.refreshView()
    });

    game.settings.register("narrative-canvas", this.SETTING_DIALOGUE_SPEED, {
      scope: "client",
      config: false,
      type: Number,
      default: 1
    });

    for (const [key, defaultValue, min, max, step, stem] of this.DIALOGUE_NUMBER_SETTINGS) {
      game.settings.register("narrative-canvas", key, {
        name: `NARRATIVE_CANVAS.Settings.${stem}Label`,
        hint: `NARRATIVE_CANVAS.Settings.${stem}Hint`,
        scope: "world",
        config: true,
        type: Number,
        range: { min, max, step },
        default: defaultValue,
        onChange: () => game.modules?.get("narrative-canvas")?.manager?.refreshView()
      });
    }

    game.settings.register("narrative-canvas", this.SETTING_DIRECTOR_LAYOUT_STATE, {
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

  static getLogLevel() {
    try {
      return game.settings.get("narrative-canvas", this.SETTING_LOG_LEVEL) || "warn";
    } catch (error) {
      return "warn";
    }
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

  /** @returns {string} Label shown when the speaker's name must stay hidden. */
  static getUnknownSpeakerName() {
    const configured = game.settings.get("narrative-canvas", this.SETTING_UNKNOWN_SPEAKER);
    return configured?.trim() || game.i18n.localize("NARRATIVE_CANVAS.Dialogue.UnknownSpeaker");
  }

  /** @returns {boolean} Whether dialogue lines read aloud are also posted to the chat. */
  static shouldPostSpokenDialogueToChat() {
    return game.settings.get("narrative-canvas", this.SETTING_SPOKEN_TO_CHAT) !== false;
  }

  /** @returns {string} CSS class marking read-aloud blocks in journals; empty if none is configured. */
  static getReadAloudClass() {
    const preset = game.settings.get("narrative-canvas", this.SETTING_READ_ALOUD_PRESET);
    const raw = preset === "custom"
      ? game.settings.get("narrative-canvas", this.SETTING_READ_ALOUD_CUSTOM_CLASS)
      : this.READ_ALOUD_CLASSES[preset === "auto" ? game.system.id.toLowerCase() : preset];
    const name = String(raw ?? "").trim().replace(/^\./, "");
    return /^[\w-]+$/.test(name) ? name : "";
  }

  /** @returns {number} A numeric dialogue setting clamped to its allowed range. */
  static getDialogueNumber(key) {
    const [, defaultValue, min, max] = this.DIALOGUE_NUMBER_SETTINGS.find(entry => entry[0] === key);
    const value = Number(game.settings.get("narrative-canvas", key));
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : defaultValue;
  }

  /** @returns {number} The user's speed multiplier for dialogue reveal and scrolling. */
  static getDialogueSpeedMultiplier() {
    const value = Number(game.settings.get("narrative-canvas", this.SETTING_DIALOGUE_SPEED));
    return Number.isFinite(value)
      ? Math.max(this.DIALOGUE_SPEED_MIN, Math.min(this.DIALOGUE_SPEED_MAX, value))
      : 1;
  }

  static async setDialogueSpeedMultiplier(multiplier) {
    await game.settings.set("narrative-canvas", this.SETTING_DIALOGUE_SPEED, multiplier);
  }

  /** Maps a 0-100 slider position logarithmically to the multiplier range. */
  static sliderToSpeedMultiplier(position) {
    const ratio = this.DIALOGUE_SPEED_MAX / this.DIALOGUE_SPEED_MIN;
    const value = this.DIALOGUE_SPEED_MIN * ratio ** (Math.max(0, Math.min(100, Number(position))) / 100);
    return Math.round(value * 100) / 100;
  }

  static speedMultiplierToSlider(multiplier) {
    const ratio = this.DIALOGUE_SPEED_MAX / this.DIALOGUE_SPEED_MIN;
    return Math.round(100 * Math.log(multiplier / this.DIALOGUE_SPEED_MIN) / Math.log(ratio));
  }

  static formatSpeedMultiplier(multiplier) {
    return `\u00d7${multiplier < 1 ? multiplier.toFixed(2) : multiplier.toFixed(1)}`;
  }

  static getDirectorLayoutState() {
    const state = game.settings.get("narrative-canvas", this.SETTING_DIRECTOR_LAYOUT_STATE) ?? {};
    const normalizeRatios = values => Object.fromEntries(
      Object.entries(values ?? {}).filter(([, ratio]) =>
        typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 && ratio <= 2
      )
    );

    return {
      panelWidthRatios: normalizeRatios(state.panelWidthRatios),
      sidebarSectionHeightRatios: normalizeRatios(state.sidebarSectionHeightRatios),
      rightPanelSectionHeightRatios: normalizeRatios(state.rightPanelSectionHeightRatios),
      imageListHeightRatios: normalizeRatios(state.imageListHeightRatios)
    };
  }

  static async saveDirectorLayoutState(updates) {
    this.#directorLayoutSaveQueue = this.#directorLayoutSaveQueue.catch(() => {}).then(async () => {
      const current = this.getDirectorLayoutState();
      await game.settings.set("narrative-canvas", this.SETTING_DIRECTOR_LAYOUT_STATE, {
        panelWidthRatios: { ...current.panelWidthRatios, ...updates.panelWidthRatios },
        sidebarSectionHeightRatios: {
          ...current.sidebarSectionHeightRatios,
          ...updates.sidebarSectionHeightRatios
        },
        rightPanelSectionHeightRatios: {
          ...current.rightPanelSectionHeightRatios,
          ...updates.rightPanelSectionHeightRatios
        },
        imageListHeightRatios: { ...current.imageListHeightRatios, ...updates.imageListHeightRatios }
      });
    });
    await this.#directorLayoutSaveQueue;
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

  static getActorImageHeight() {
    return game.settings.get("narrative-canvas", this.SETTING_ACTOR_IMAGE_HEIGHT);
  }

  static getThemeId() {
    return game.settings.get("narrative-canvas", this.SETTING_THEME);
  }
}

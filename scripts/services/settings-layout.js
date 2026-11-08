import { NarrativeSettings } from "./settings.js";
import { LayoutRegistry } from "../ui/layout/layout-registry.js";

const STRATEGY_SETTINGS = [
  [NarrativeSettings.SETTING_HANDOUT_LAYOUT, "handout"],
  [NarrativeSettings.SETTING_ACTOR_LAYOUT, "actor"]
];

const SECTIONS = [
  {
    label: "NARRATIVE_CANVAS.Settings.Sections.General",
    keys: [
      NarrativeSettings.SETTING_PERMISSION,
      NarrativeSettings.SETTING_TOASTS,
      NarrativeSettings.SETTING_CHARACTER_SHEETS,
      NarrativeSettings.SETTING_LOG_LEVEL
    ]
  },
  {
    label: "NARRATIVE_CANVAS.Settings.Sections.Appearance",
    keys: [
      NarrativeSettings.SETTING_THEME,
      NarrativeSettings.SETTING_BG_COLOR,
      NarrativeSettings.SETTING_DEFAULT_BG_IMAGE,
      NarrativeSettings.SETTING_ACTOR_IMAGE_HEIGHT,
      NarrativeSettings.SETTING_ACTOR_LAYOUT,
      NarrativeSettings.SETTING_FADE_DURATION
    ]
  },
  {
    label: "NARRATIVE_CANVAS.Settings.Sections.HandoutComic",
    keys: [
      NarrativeSettings.SETTING_HANDOUT_LAYOUT,
      NarrativeSettings.SETTING_HANDOUT_MAX_HEIGHT,
      NarrativeSettings.SETTING_COMIC_MAX_WIDTH,
      NarrativeSettings.SETTING_COMIC_MAX_PER_ROW,
      NarrativeSettings.SETTING_COMIC_DIRECTION,
      NarrativeSettings.SETTING_COMIC_CAPTION_POSITION
    ]
  },
  {
    label: "NARRATIVE_CANVAS.Settings.Sections.Journal",
    keys: [
      NarrativeSettings.SETTING_JOURNAL_ROOT_FOLDER,
      NarrativeSettings.SETTING_READ_ALOUD_PRESET,
      NarrativeSettings.SETTING_READ_ALOUD_CUSTOM_CLASS,
      NarrativeSettings.SETTING_QUOTE_MAX_PARAGRAPHS
    ]
  },
  {
    label: "NARRATIVE_CANVAS.Settings.Sections.Dialogue",
    keys: [
      NarrativeSettings.SETTING_UNKNOWN_SPEAKER,
      NarrativeSettings.SETTING_SPOKEN_TO_CHAT
    ]
  },
  {
    label: "NARRATIVE_CANVAS.Settings.Sections.DialogueDisplay",
    keys: [
      NarrativeSettings.SETTING_DIALOGUE_TEXT_SCALE,
      NarrativeSettings.SETTING_NARRATION_TEXT_SCALE,
      NarrativeSettings.SETTING_NARRATION_MAX_HEIGHT
    ]
  },
  {
    label: "NARRATIVE_CANVAS.Settings.Sections.DialogueTiming",
    keys: [
      NarrativeSettings.SETTING_DIALOGUE_REVEAL_MODE,
      NarrativeSettings.SETTING_NARRATION_REVEAL_MODE,
      NarrativeSettings.SETTING_NARRATION_READING_SPEED,
      NarrativeSettings.SETTING_DIALOGUE_SCROLL_SPEED,
      NarrativeSettings.SETTING_NARRATION_HOLD_BASE,
      NarrativeSettings.SETTING_NARRATION_HOLD_PER_LINE
    ]
  }
];

/** Groups the module's entries in the settings window under section headings. */
export class NarrativeSettingsLayout {
  /** @param {HTMLElement|{0: HTMLElement}} html The rendered settings window. */
  static apply(html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    const findGroup = key => root.querySelector(`[name="narrative-canvas.${key}"]`)?.closest(".form-group") ?? null;
    for (const [key, kind] of STRATEGY_SETTINGS) {
      const select = root.querySelector(`select[name="narrative-canvas.${key}"]`);
      const hints = LayoutRegistry.getHints(kind);
      select?.querySelectorAll("option").forEach(option => {
        if (hints[option.value]) option.title = game.i18n.localize(hints[option.value]);
      });
    }
    const firstGroup = SECTIONS.flatMap(section => section.keys).map(findGroup).find(Boolean);
    if (!firstGroup || root.querySelector(".nc-settings-heading")) return;

    const placeholder = document.createComment("narrative-canvas-settings");
    firstGroup.before(placeholder);

    const fragment = document.createDocumentFragment();
    for (const section of SECTIONS) {
      const groups = section.keys.map(findGroup).filter(Boolean);
      if (!groups.length) continue;

      const heading = document.createElement("h4");
      heading.className = "divider nc-settings-heading";
      heading.textContent = game.i18n.localize(section.label);
      fragment.append(heading, ...groups);
    }
    placeholder.replaceWith(fragment);
  }
}

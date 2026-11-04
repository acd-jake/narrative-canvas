import { NarrativeSettings } from "./settings.js";

const SECTIONS = [
  {
    label: "NARRATIVE_CANVAS.Settings.Sections.General",
    keys: [
      NarrativeSettings.SETTING_PERMISSION,
      NarrativeSettings.SETTING_TOASTS,
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
      NarrativeSettings.SETTING_FADE_DURATION
    ]
  },
  {
    label: "NARRATIVE_CANVAS.Settings.Sections.Journal",
    keys: [
      NarrativeSettings.SETTING_JOURNAL_ROOT_FOLDER,
      NarrativeSettings.SETTING_READ_ALOUD_PRESET,
      NarrativeSettings.SETTING_READ_ALOUD_CUSTOM_CLASS
    ]
  },
  {
    label: "NARRATIVE_CANVAS.Settings.Sections.Dialogue",
    keys: [
      NarrativeSettings.SETTING_UNKNOWN_SPEAKER,
      NarrativeSettings.SETTING_SPOKEN_TO_CHAT
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

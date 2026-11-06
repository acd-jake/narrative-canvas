import { FreeHandoutLayout } from "./handout/free-handout-layout.js";
import { ComicHandoutLayout } from "./handout/comic-handout-layout.js";
import { RowActorLayout } from "./actor/row-actor-layout.js";
import { AlternatingActorLayout } from "./actor/alternating-actor-layout.js";
import { SpeakerCenterActorLayout } from "./actor/speaker-center-actor-layout.js";
import { ArcActorLayout } from "./actor/arc-actor-layout.js";
import { StackedActorLayout } from "./actor/stacked-actor-layout.js";

const STRATEGIES = {
  handout: [FreeHandoutLayout, ComicHandoutLayout],
  actor: [RowActorLayout, AlternatingActorLayout, SpeakerCenterActorLayout, ArcActorLayout, StackedActorLayout]
};

/** Looks up layout strategies by kind ("handout" | "actor") and id. */
export class LayoutRegistry {
  static getDefaultId(kind) {
    return STRATEGIES[kind][0].id;
  }

  /** @returns {Record<string, string>} Strategy id mapped to its localization key. */
  static getChoices(kind) {
    return Object.fromEntries(STRATEGIES[kind].map(strategy => [strategy.id, strategy.labelKey]));
  }

  /** @returns {Record<string, string>} Strategy id mapped to the localization key of its short explanation. */
  static getHints(kind) {
    return Object.fromEntries(STRATEGIES[kind].map(strategy => [strategy.id, `${strategy.labelKey}Hint`]));
  }

  static create(kind, id) {
    const Strategy = STRATEGIES[kind].find(strategy => strategy.id === id) ?? STRATEGIES[kind][0];
    return new Strategy();
  }
}

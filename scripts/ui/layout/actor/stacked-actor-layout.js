import { PositionedActorLayout } from "./row-actor-layout.js";

/** Actors overlap like a group portrait; later actors and the speaker are in front. */
export class StackedActorLayout extends PositionedActorLayout {
  static id = "stacked";
  static labelKey = "NARRATIVE_CANVAS.Settings.LayoutStrategies.Actor.Stacked";

  compute(items) {
    const centers = PositionedActorLayout.spread(items.length, Math.min(0.16, 0.7 / items.length));
    return items.map((item, index) => ({
      x: centers[index],
      y: 0,
      scale: 1,
      z: item.isSpeaker ? items.length + 1 : index + 1
    }));
  }
}

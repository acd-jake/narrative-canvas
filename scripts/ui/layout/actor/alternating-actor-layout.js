import { PositionedActorLayout } from "./row-actor-layout.js";

/** The first actor stands in the middle; each further actor is appended alternately to the right and left end. */
export class AlternatingActorLayout extends PositionedActorLayout {
  static id = "alternating";
  static labelKey = "NARRATIVE_CANVAS.Settings.LayoutStrategies.Actor.Alternating";

  compute(items) {
    const indices = items.map((item, index) => index);
    const lefts = indices.filter(index => index > 0 && index % 2 === 0).reverse();
    const rights = indices.filter(index => index % 2 === 1);
    const sequence = items.length ? [...lefts, 0, ...rights] : [];
    const centers = PositionedActorLayout.spread(items.length, Math.min(0.22, 0.9 / items.length));
    const placements = new Array(items.length);
    sequence.forEach((index, position) => {
      placements[index] = { x: centers[position], y: 0, scale: 1, z: items[index].isSpeaker ? items.length + 1 : 1 };
    });
    return placements;
  }
}

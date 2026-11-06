import { PositionedActorLayout } from "./row-actor-layout.js";

/** Actors stand on a semicircle: those in the middle are placed further back and look smaller. */
export class ArcActorLayout extends PositionedActorLayout {
  static id = "arc";
  static labelKey = "NARRATIVE_CANVAS.Settings.LayoutStrategies.Actor.Arc";

  compute(items) {
    const count = items.length;
    return items.map((item, index) => {
      const t = count === 1 ? 0.5 : index / (count - 1);
      const depth = Math.sin(Math.PI * t);
      return {
        x: count === 1 ? 0.5 : 0.12 + t * 0.76,
        y: 0.1 * depth,
        scale: 1 - 0.14 * depth,
        z: item.isSpeaker ? count + 1 : Math.round((1 - depth) * count)
      };
    });
  }
}

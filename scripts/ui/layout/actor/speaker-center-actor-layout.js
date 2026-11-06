import { PositionedActorLayout } from "./row-actor-layout.js";

/** The speaker stands in the middle; the other actors alternate to its left and right. */
export class SpeakerCenterActorLayout extends PositionedActorLayout {
  static id = "speaker-center";
  static labelKey = "NARRATIVE_CANVAS.Settings.LayoutStrategies.Actor.SpeakerCenter";

  compute(items) {
    const speakerIndex = items.findIndex(item => item.isSpeaker);
    if (speakerIndex < 0) {
      const centers = PositionedActorLayout.spread(items.length, Math.min(0.3, 0.9 / items.length));
      return centers.map(x => ({ x, y: 0, scale: 1, z: 1 }));
    }

    const others = items.map((item, index) => index).filter(index => index !== speakerIndex);
    const left = others.filter((_, order) => order % 2 === 0);
    const right = others.filter((_, order) => order % 2 === 1);
    const step = Math.min(0.28, 0.42 / Math.max(left.length, right.length, 1));
    const placements = new Array(items.length);
    placements[speakerIndex] = { x: 0.5, y: 0, scale: 1, z: 3 };
    left.forEach((index, order) => { placements[index] = { x: 0.5 - step * (order + 1) - 0.08, y: 0, scale: 0.92, z: 2 }; });
    right.forEach((index, order) => { placements[index] = { x: 0.5 + step * (order + 1) + 0.08, y: 0, scale: 0.92, z: 2 }; });
    return placements;
  }
}

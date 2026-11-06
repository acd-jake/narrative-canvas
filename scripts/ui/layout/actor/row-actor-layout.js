import { LayoutController } from "../layout-controller.js";

export class RowActorLayout extends LayoutController {
  static id = "row";
  static labelKey = "NARRATIVE_CANVAS.Settings.LayoutStrategies.Actor.Row";
}

/** Shared helpers for strategies that place actors with explicit coordinates. */
export class PositionedActorLayout extends LayoutController {
  get cssClass() {
    return "is-custom-layout";
  }

  get isManual() {
    return false;
  }

  /** Evenly spaced centers around 0.5 with the given spacing (fraction of stage width). */
  static spread(count, spacing) {
    return Array.from({ length: count }, (_, index) => 0.5 + (index - (count - 1) / 2) * spacing);
  }
}

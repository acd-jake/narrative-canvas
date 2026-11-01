import { NarrativeCanvas } from "./narrative-canvas.js";
import { NarrativeSettings } from "../services/settings.js";

/**
 * Passive client-side presentation layer for players, enhanced with 
 * configuration-controlled activation and deactivation toasts.
 */
export class NarrativePlayer extends NarrativeCanvas {
  constructor() {
    super("narrative-player-display", "player-view");
    
    /**
     * Guard flag to prevent duplicate notifications during subsequent state changes.
     * @type {boolean}
     */
    this.isAlreadyNotified = false;
  }

  /** @override */
  async render(state) {
    await super.render(state);

    // Fire activation toast exclusively if enabled in configuration and not yet triggered
    if (this.stageElement && !this.isAlreadyNotified) {
      if (NarrativeSettings.areToastsEnabled()) {
        ui.notifications.info(game.i18n.localize("NARRATIVE_CANVAS.Notifications.Activated"));
      }
      this.isAlreadyNotified = true;
    }
  }

  /** @override */
  close() {
    // Only fire deactivation toast if the player was actively seeing the canvas overlay
    if (this.stageElement && NarrativeSettings.areToastsEnabled()) {
      ui.notifications.info(game.i18n.localize("NARRATIVE_CANVAS.Notifications.Deactivated"));
    }

    super.close();
    this.isAlreadyNotified = false;
  }
}

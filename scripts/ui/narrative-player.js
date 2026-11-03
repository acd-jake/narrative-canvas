import { NarrativeCanvas } from "./narrative-canvas.js";
import { NarrativeSettings } from "../services/settings.js";

/**
 * Passive client-side presentation layer for players, enhanced with 
 * configuration-controlled activation and deactivation toasts.
 */
export class NarrativePlayer extends NarrativeCanvas {
  constructor({ onClose, onAudioVolumeChange, onAudioMuteChange } = {}) {
    super("narrative-player-display", "player-view");
    this.onClose = onClose;
    this.onAudioVolumeChange = onAudioVolumeChange;
    this.onAudioMuteChange = onAudioMuteChange;
    
    /**
     * Guard flag to prevent duplicate notifications during subsequent state changes.
     * @type {boolean}
     */
    this.isAlreadyNotified = false;
  }

  /** @override */
  async _onPrepareElements(stageElement) {
    stageElement.querySelector(".btn-close-player-canvas")?.addEventListener("click", () => {
      this.onClose?.();
    });

    stageElement.querySelector(".player-audio-volume")?.addEventListener("input", event => {
      const volume = Number(event.currentTarget.value);
      const percent = Math.round(volume * 100);
      const output = stageElement.querySelector(".player-audio-volume-percent");
      event.currentTarget.setAttribute("aria-valuetext", `${percent}%`);
      if (output) output.value = `${percent}%`;
      this.onAudioVolumeChange?.(volume);
    });

    stageElement.querySelector(".btn-player-audio-mute")?.addEventListener("click", event => {
      const button = event.currentTarget;
      const muted = button.dataset.muted !== "true";
      this.#updateMuteButton(button, muted);
      this.onAudioMuteChange?.(muted);
    });
  }

  /** @override */
  async render(state) {
    await super.render(state);
    const volumeInput = this.stageElement?.querySelector(".player-audio-volume");
    if (volumeInput && document.activeElement !== volumeInput) {
      volumeInput.value = String(state.playerAudioVolume ?? 1);
      volumeInput.setAttribute("aria-valuetext", `${state.playerAudioVolumePercent ?? 100}%`);
      const output = this.stageElement.querySelector(".player-audio-volume-percent");
      if (output) output.value = `${state.playerAudioVolumePercent ?? 100}%`;
    }
    const muteButton = this.stageElement?.querySelector(".btn-player-audio-mute");
    if (muteButton) this.#updateMuteButton(muteButton, Boolean(state.playerAudioMuted));

    // Fire activation toast exclusively if enabled in configuration and not yet triggered
    if (this.stageElement && !this.isAlreadyNotified) {
      if (NarrativeSettings.areToastsEnabled()) {
        ui.notifications.info(game.i18n.localize("NARRATIVE_CANVAS.Notifications.Activated"));
      }
      this.isAlreadyNotified = true;
    }
  }

  /** @override */
  async close({ isLocalDismissal = false } = {}) {
    // Only fire deactivation toast if the player was actively seeing the canvas overlay
    if (!isLocalDismissal && this.stageElement && NarrativeSettings.areToastsEnabled()) {
      ui.notifications.info(game.i18n.localize("NARRATIVE_CANVAS.Notifications.Deactivated"));
    }

    await super.close();
    this.isAlreadyNotified = false;
  }

  #updateMuteButton(button, muted) {
    const label = game.i18n.localize(muted
      ? "NARRATIVE_CANVAS.Player.UnmuteAudio"
      : "NARRATIVE_CANVAS.Player.MuteAudio");
    button.dataset.muted = String(muted);
    button.title = label;
    button.setAttribute("aria-label", label);
    button.querySelector("i").className = `fas ${muted ? "fa-volume-xmark" : "fa-volume-high"}`;
  }
}

import { NarrativeCanvas } from "./narrative-canvas.js";

export class NarrativeDirector extends NarrativeCanvas {
  constructor(callbacks) {
    super("narrative-canvas-director", "director-view");
    this.callbacks = callbacks;
    this._setupGlobalDelegatedListeners();
    this._activeSound = null; // Native sound object tracking reference
  }

  /** @override */
  async _onPrepareElements(stageElement, context) {
    // 1. Render and append the Main controls panel card
    const controlsHtml = await renderTemplate("modules/narrative-canvas/templates/partials/director-controls.hbs", context);
    const parser = new DOMParser();
    stageElement.appendChild(parser.parseFromString(controlsHtml, "text/html").body.firstElementChild);

    if (context.currentSceneData) {
      // 2. Render and append the Left Audio Control Sidebar panel
      const audioHtml = await renderTemplate("modules/narrative-canvas/templates/partials/director-audio.hbs", context);
      stageElement.appendChild(parser.parseFromString(audioHtml, "text/html").body.firstElementChild);

      // 3. Render and append the Bottom Horizontal Actor Control Panel
      const actorsHtml = await renderTemplate("modules/narrative-canvas/templates/partials/director-actors.hbs", context);
      stageElement.appendChild(parser.parseFromString(actorsHtml, "text/html").body.firstElementChild);
    }
  }

  /** @override */
  close() {
    this._stopActiveTrack();
    super.close();
  }

  _setupGlobalDelegatedListeners() {
    document.body.addEventListener("click", async (event) => {
      if (!this.stageElement) return;
      const target = event.target;

      // 1. Scene Selection Dropdown Changes
      if (target.classList.contains("selector-narrative-scene")) {
        target.addEventListener("change", (e) => {
          this.callbacks.onSceneSelect(e.target.value);
        }, { once: true });
        return;
      }

      // 2. Click on Quick List Background Cards
      const bgCard = target.closest(".bg-thumbnail-card");
      if (bgCard) {
        event.preventDefault();
        const path = bgCard.dataset.bgPath;
        this.callbacks.onBackgroundChange(path);
        return;
      }

      // 3. Click on Horizontal Actor Profile Cards
      const actorCard = target.closest(".actor-card");
      if (actorCard) {
        event.preventDefault();
        const actorId = actorCard.dataset.actorId;
        this.callbacks.onActorStageToggle(actorId);
        return;
      }

      // 4. Click Play Sound Button
      const playBtn = target.closest(".btn-audio-play");
      if (playBtn) {
        event.preventDefault();
        const trackId = playBtn.closest(".audio-track-row").dataset.trackId;
        this._playTrack(trackId);
        return;
      }

      // 5. Click Stop Sound Button
      const stopBtn = target.closest(".btn-audio-stop");
      if (stopBtn) {
        event.preventDefault();
        this._stopActiveTrack();
        return;
      }

      // Traditional standard controls delegation (Publish, Hide, Shutdown)
      if (target.closest(".btn-publish-players")) { event.preventDefault(); this.callbacks.onVisibilityChange(true); return; }
      if (target.closest(".btn-hide-players")) { event.preventDefault(); this.callbacks.onVisibilityChange(false); return; }
      if (target.closest(".btn-shutdown-canvas")) { event.preventDefault(); this.callbacks.onShutdown(); return; }
    });

    // Delegated Event tracking for audio track slider shifts
    document.body.addEventListener("input", (event) => {
      if (!this.stageElement) return;
      if (event.target.classList.contains("slider-global-volume")) {
        const volume = parseFloat(event.target.value);
        if (this._activeSound) this._activeSound.volume = volume;
        this.callbacks.onVolumeChange(volume);
      }
    });
  }

  /**
   * Sound Core Execution Pipeline: Triggers and runs native audio stream containers.
   */
  async _playTrack(trackId) {
    this._stopActiveTrack();
    
    const track = this.stageElement.querySelector(`.audio-track-row[data-track-id="${trackId}"]`);
    if (!track) return;

    const scenes = game.settings.get("narrative-canvas", "configuredScenesDataset");
    const currentScene = scenes.find(s => s.id === this.stageElement.id.replace("narrative-canvas-director-", ""));
    const trackData = currentScene?.tracks.find(t => t.id === trackId);

    if (trackData) {
      // Call standard V14 audio engine wrapper configurations
      this._activeSound = await game.audio.playToAll(trackData.path, {
        loop: true,
        volume: parseFloat(this.stageElement.querySelector(".slider-global-volume")?.value || 0.5)
      });
      this.callbacks.onTrackPlay(trackId);
    }
  }

  _stopActiveTrack() {
    if (this._activeSound) {
      this._activeSound.stop();
      this._activeSound = null;
    }
    this.callbacks.onTrackPlay(null);
  }
}

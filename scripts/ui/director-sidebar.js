import { JournalBrowser } from "../services/journal-browser.js";
import { NarrativeSceneRepository } from "../services/scene-repository.js";
import { NarrativeSettings } from "../services/settings.js";
import { ResizableSectionController } from "./resizable-section-controller.js";
import { ResizablePanelController } from "./resizable-panel-controller.js";
import { JournalViewerFontSizeController } from "./journal-viewer-font-size-controller.js";
import { JournalSelectionMenu } from "./journal-selection-menu.js";
import { NarrativeLogger } from "../services/logger.js";
import { stopOtherSceneAudio } from "../services/scene-audio-exclusivity.js";

/**
 * Controller for the Director Left Sidebar, managing filterable scenes,
 * a filterable journal viewer with a draggable/scrollable badge TOC,
 * and the active scene's audio playback & volume controls.
 */
export class DirectorSidebar {
  #callbacks;
  #audioMixer = null;
  #element = null;
  #audioControlsRoot = null;
  #sceneQuery = "";
  #filterByJournal = true;
  #autoActivateFirstSceneOnJournalChange = true;
  #isCollapsed = false;
  #areScenesCollapsed = true;
  #isJournalCollapsed = false;
  #rootJournalFolderId = "";
  #currentJournalFolderId = "";
  #journalQuery = "";
  #selectedJournalId = "";
  #selectedPageId = "";
  #linkedJournalOption = null;
  #journalNavigationHistory = [];
  #journalStateSaveTimeout = null;
  #activeSceneId = "";
  #scenesList = [];
  #currentSceneData = null;
  #audioMuted = false;
  #sceneSectionHeight = null;
  #journalSectionHeight = null;
  #panelOverflowOffset = 0;
  #resizableSections = [];
  #panelWidth = 350;
  #panelResizeController = null;
  #journalViewerFontSizeController = new JournalViewerFontSizeController();
  #journalSelectionMenu = null;
  #voiceActive = false;
  #layoutStateSaveTimeout = null;
  #layoutState = null;
  #playlistSoundHook = null;
  #expandedPlaylistIds = new Set();
  #activePlaylistIds = new Set();

  /**
   * @param {object} options
  * @param {PlaylistAudioMixer} options.audioMixer
  * @param {(sceneId: string|null) => void} options.onSceneSelect
  * @param {(journalId: string) => void} options.onJournalSelect
   * @param {(volume: number) => void} [options.onVolumeChange]
   * @param {(image: {src: string, title: string}) => void} [options.onJournalImageShow]
   */
  constructor({ audioMixer, onSceneSelect, onJournalSelect, onVolumeChange, onJournalImageShow, onDialogueTextSelect, onNarrationSend, isDialogueEnabled }) {
    this.#audioMixer = audioMixer;
    this.#callbacks = { onSceneSelect, onJournalSelect, onVolumeChange, onJournalImageShow };
    this.#journalSelectionMenu = new JournalSelectionMenu({
      isEnabled: () => isDialogueEnabled?.() === true,
      isVoiceEnabled: () => this.#voiceActive,
      onUseText: (text, direction) => onDialogueTextSelect?.(text, direction),
      onSendNarration: text => onNarrationSend?.(text)
    });
    this.#layoutState = NarrativeSettings.getDirectorLayoutState() || {};
    const savedPanelWidthRatio = this.#layoutState.panelWidthRatios.sidebar;
    if (savedPanelWidthRatio) this.#panelWidth = savedPanelWidthRatio * window.innerWidth;

    const journalViewerState = NarrativeSettings.getJournalViewerState();
    this.#rootJournalFolderId = NarrativeSettings.getJournalRootFolder();
    this.#currentJournalFolderId = this.#rootJournalFolderId;
    this.#journalQuery = journalViewerState.query;
    this.#selectedJournalId = journalViewerState.journalId;
    this.#selectedPageId = journalViewerState.pageId;
    this.#playlistSoundHook = Hooks.on("updatePlaylistSound", sound => {
      if (this.#currentSceneData?.tracks?.some(track => track.id === sound.id)) {
        NarrativeLogger.debug("Foundry Playlist track state changed", {
          trackId: sound.id,
          trackName: sound.name,
          isPlaying: sound.playing,
          pausedTime: sound.pausedTime
        });
        this.#refreshAudioTracksList();
      }
    });
  }

  destroy() {
    if (this.#playlistSoundHook) Hooks.off("updatePlaylistSound", this.#playlistSoundHook);
    this.#playlistSoundHook = null;
    this.#destroyResizableSections();
    this.#destroyPanelResizeController();
    if (this.#layoutStateSaveTimeout !== null) {
      clearTimeout(this.#layoutStateSaveTimeout);
      void NarrativeSettings.saveDirectorLayoutState({
        panelWidthRatios: { sidebar: this.#layoutState.panelWidthRatios.sidebar },
        sidebarSectionHeightRatios: this.#layoutState.sidebarSectionHeightRatios
      });
    }
    this.#audioControlsRoot = null;
    this.#journalSelectionMenu?.close();
    this.#element = null;
  }

  async stopAllPlaylists() {
    const playlistIds = [...this.#activePlaylistIds];
    await Promise.all(playlistIds.map(async playlistId => {
      const playlist = game.playlists?.get(playlistId)
        ?? game.collections?.get("Playlist")?.get(playlistId);
      if (!playlist) return;

      await playlist.stopAll();
      await Promise.all(Array.from(playlist.sounds ?? [])
        .filter(sound => !sound.playing && Number(sound.pausedTime) > 0)
        .map(sound => sound.update({ playing: false, pausedTime: 0 })));
    }));
    this.#activePlaylistIds.clear();
    this.#refreshAudioTracksList();
  }

  /**
   * Returns whether the sidebar is currently collapsed.
   * @returns {boolean}
   */
  get isCollapsed() {
    return this.#isCollapsed;
  }

  /**
   * Toggles or sets the collapsed state of the sidebar.
   * @param {boolean} [forceState] - Optional explicit state
   */
  toggleCollapse(forceState) {
    this.#isCollapsed = typeof forceState === "boolean" ? forceState : !this.#isCollapsed;
    this.#updateCollapseState();
  }

  /**
   * Synchronizes DOM classes, icons, and tooltip titles with current collapse state.
   * @private
   */
  #updateCollapseState() {
    if (!this.#element) return;
    this.#element.classList.toggle("is-collapsed", this.#isCollapsed);

    const toggleBtn = this.#element.querySelector(".btn-resize-director-panel");
    if (toggleBtn) {
      const title = this.#isCollapsed
        ? game.i18n.localize("NARRATIVE_CANVAS.Director.ExpandSidebar")
        : game.i18n.localize("NARRATIVE_CANVAS.Director.ResizePanelWidth");
      toggleBtn.title = title;
      toggleBtn.setAttribute("aria-label", title);
      toggleBtn.setAttribute("aria-expanded", String(!this.#isCollapsed));
      const icon = toggleBtn.querySelector("i");
      if (icon) {
        icon.className = `fas ${this.#isCollapsed ? "fa-chevron-right" : "fa-grip-lines-vertical"}`;
      }
    }

  }

  /**
   * Builds the sidebar HTML and registers its event handlers.
   * @param {object} context
   * @returns {Promise<HTMLElement>}
   */
  async render(context = {}) {
    this.#activeSceneId = context.activeSceneId ?? this.#activeSceneId;
    this.#audioMuted = Boolean(context.audioMuted);
    this.#scenesList = context.scenesList ?? NarrativeSceneRepository.getAll();
    this.#currentSceneData = context.currentSceneData ?? (this.#activeSceneId ? this.#scenesList.find(s => s.id === this.#activeSceneId) : null);

    if (context.globalVolume !== undefined && this.#audioMixer) {
      this.#audioMixer.globalVolume = context.globalVolume;
    }

    const templateData = await this.#prepareTemplateData();
    const htmlString = await foundry.applications.handlebars.renderTemplate(
      "modules/narrative-canvas/templates/partials/director-sidebar.hbs",
      templateData
    );

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;

    this.#destroyResizableSections();
    this.#destroyPanelResizeController();
    this.#element = newElement;
    this.#element.classList.toggle("is-dialogue-active", context.dialogueSystemEnabled === true);
    this.#toggleVoiceActive(context);
    this.#journalViewerFontSizeController.mount(this.#element);
    this.#journalSelectionMenu?.mount(this.#element);
    this.#bindListeners(this.#element);
    this.#updateCollapseState();
    this.#applySceneFilters();

    return newElement;
  }

  /** Stage-direction controls need speech to be possible: dialogue on, voice on, canvas released to the players. */
  #toggleVoiceActive(context) {
    const active = context.dialogueSystemEnabled === true && context.dialogueVoice === true
      && context.playerViewActive === true
      && game.modules.get("acd-talking-actors")?.active === true;
    this.#voiceActive = active;
    this.#element?.classList.toggle("is-dialogue-voice-active", active);
    if (!active) this.#journalSelectionMenu?.close();
  }

  /**
   * Updates sidebar state in-place when scene or volume changes.
   * @param {object} context
   */
  update(context = {}) {
    this.#element?.classList.toggle("is-dialogue-active", context.dialogueSystemEnabled === true);
    this.#toggleVoiceActive(context);
    if (!this.#element) return;
    this.#activeSceneId = context.activeSceneId ?? this.#activeSceneId;
    this.#audioMuted = Boolean(context.audioMuted);

    const previousScenes = this.#scenesList;
    this.#scenesList = context.scenesList ?? this.#scenesList;
    this.#currentSceneData = context.currentSceneData ?? (this.#activeSceneId ? this.#scenesList.find(s => s.id === this.#activeSceneId) : null);
    this.#updateActiveSceneName();

    // If the scenes collection reference changed, re-render the scenes list
    if (this.#scenesList !== previousScenes) {
      this.#refreshScenesList();
    } else {
      // Update active highlight in scenes list
      this.#element.querySelectorAll(".director-scene-item").forEach(item => {
        item.classList.toggle("is-active", item.dataset.sceneId === this.#activeSceneId);
      });
    }

    this.#updateCollapseState();
    this.#audioControlsRoot?.classList.toggle("is-muted", this.#audioMuted);

    // Refresh audio tracks list for the active scene
    this.#refreshAudioTracksList();
  }

  /**
   * Re-renders the scene items list when the collection of scenes changes.
   * @private
   */
  #refreshScenesList() {
    if (!this.#element) return;
    const container = this.#element.querySelector(".director-scenes-list");
    if (!container) return;

    if (!this.#scenesList.length) {
      container.innerHTML = `<div class="sidebar-empty-hint">${game.i18n.localize("NARRATIVE_CANVAS.Director.NoScenes")}</div>`;
      return;
    }

    container.innerHTML = this.#scenesList.map(scene => {
      const isActive = scene.id === this.#activeSceneId;
      const journalName = scene.journalName
        ?? (scene.journalId ? (game.journal?.get(scene.journalId)?.name ?? game.collections?.get("JournalEntry")?.get(scene.journalId)?.name) : null);
      const journalBadge = journalName
        ? `<span class="scene-item-journal" title="${Handlebars.escapeExpression(journalName)}"><i class="fas fa-book-open"></i> ${Handlebars.escapeExpression(journalName)}</span>`
        : "";

      return `
        <div class="director-scene-item ${isActive ? "is-active" : ""}" data-scene-id="${scene.id}" data-journal-id="${scene.journalId || ""}">
          <span class="scene-item-name" title="${Handlebars.escapeExpression(scene.name)}">
            <i class="fas fa-film"></i> ${Handlebars.escapeExpression(scene.name)}
          </span>
          ${journalBadge}
        </div>
      `;
    }).join("");

    this.#applySceneFilters();
  }

  /**
   * Refreshes the audio tracks list in the sidebar for the current scene.
   * @private
   */
  #refreshAudioTracksList() {
    if (!this.#audioControlsRoot) return;
    const tracksContainer = this.#audioControlsRoot.querySelector(".director-audio-tracks-list");
    if (!tracksContainer) return;

    const scrollTop = tracksContainer.scrollTop;
    const activeSceneTracks = this.#getAudioTracksWithPlaybackState();
    this.#updateNowPlayingDisplay(activeSceneTracks);
    if (activeSceneTracks.length === 0) {
      tracksContainer.innerHTML = `<div class="sidebar-empty-hint">${game.i18n.localize("NARRATIVE_CANVAS.Director.NoAudioTracks")}</div>`;
      tracksContainer.scrollTop = scrollTop;
      return;
    }

    tracksContainer.innerHTML = this.#getSceneAudioEntries(activeSceneTracks)
      .map(entry => this.#renderSceneAudioEntry(entry))
      .join("");
    tracksContainer.scrollTop = scrollTop;
  }

  refreshAudioPlayback() {
    this.#refreshAudioTracksList();
  }

  getAudioControlsContext() {
    const activeSceneTracks = this.#getAudioTracksWithPlaybackState();
    const globalVolume = this.#audioMixer?.globalVolume ?? 0.5;
    return {
      activeSceneAudioEntries: this.#getSceneAudioEntries(activeSceneTracks),
      audioMuted: this.#audioMuted,
      nowPlayingText: this.#getNowPlayingText(activeSceneTracks),
      globalVolume,
      masterVolumePercent: Math.round(globalVolume * 100)
    };
  }

  attachAudioControls(root) {
    const audioSection = root?.matches(".sidebar-audio-section")
      ? root
      : root?.querySelector(".sidebar-audio-section");
    if (!audioSection) return;

    if (this.#audioControlsRoot !== audioSection) {
      this.#audioControlsRoot = audioSection;
      this.#bindAudioControls(audioSection);
    }
    audioSection.classList.toggle("is-muted", this.#audioMuted);
    this.#refreshAudioTracksList();
  }

  #getSceneAudioEntries(tracks) {
    const entries = [];
    const playlists = new Map();

    for (const track of tracks) {
      if (!track.sourcePlaylistId || track.isPlaylistGroup === false) {
        entries.push({ type: "track", track });
        continue;
      }

      let playlist = playlists.get(track.sourcePlaylistId);
      if (!playlist) {
        playlist = {
          playlistId: track.sourcePlaylistId,
          name: track.sourcePlaylistName
            || game.playlists?.get(track.sourcePlaylistId)?.name
            || game.collections?.get("Playlist")?.get(track.sourcePlaylistId)?.name
            || game.i18n.localize("NARRATIVE_CANVAS.Editor.AudioPlaylist"),
          tracks: []
        };
        playlists.set(track.sourcePlaylistId, playlist);
      }
      playlist.tracks.push(track);
    }

    for (const playlist of playlists.values()) {
      const isPlaying = playlist.tracks.some(track => track.playState === "playing");
      const isPaused = !isPlaying && playlist.tracks.some(track => track.playState === "paused");
      entries.push({
        ...playlist,
        type: "playlist",
        playState: isPlaying ? "playing" : isPaused ? "paused" : "stopped",
        isExpanded: this.#expandedPlaylistIds.has(playlist.playlistId)
      });
    }

    return entries;
  }

  #renderSceneAudioEntry(entry) {
    if (entry.type === "track") return this.#renderSceneAudioTrack(entry.track);

    const isPlaying = entry.playState === "playing";
    const isPaused = entry.playState === "paused";
    const playLabel = game.i18n.localize(isPlaying
      ? "NARRATIVE_CANVAS.Director.Pause"
      : "NARRATIVE_CANVAS.Director.Play");
    const stopLabel = game.i18n.localize("NARRATIVE_CANVAS.Director.Stop");
    const expandLabel = game.i18n.localize(entry.isExpanded
      ? "NARRATIVE_CANVAS.Director.CollapsePlaylist"
      : "NARRATIVE_CANVAS.Director.ExpandPlaylist");

    return `
      <div class="director-audio-playlist-group ${isPlaying ? "is-playing" : ""} ${isPaused ? "is-paused" : ""}" data-playlist-id="${Handlebars.escapeExpression(entry.playlistId)}">
        <div class="director-audio-playlist-header">
          <button type="button" class="btn-scene-playlist-expand type-icon" data-playlist-id="${Handlebars.escapeExpression(entry.playlistId)}" aria-expanded="${entry.isExpanded}" title="${expandLabel}" aria-label="${expandLabel}">
            <i class="fas ${entry.isExpanded ? "fa-chevron-down" : "fa-chevron-right"}" aria-hidden="true"></i>
          </button>
          <span class="director-audio-playlist-name" title="${Handlebars.escapeExpression(entry.name)}">
            <i class="fas fa-list-ul" aria-hidden="true"></i> ${Handlebars.escapeExpression(entry.name)}
          </span>
          <div class="audio-track-actions">
            <button type="button" class="btn-scene-playlist-toggle type-icon" data-playlist-id="${Handlebars.escapeExpression(entry.playlistId)}" title="${playLabel}" aria-label="${playLabel}">
              <i class="fas ${isPlaying ? "fa-pause" : "fa-play"}" aria-hidden="true"></i>
            </button>
            <button type="button" class="btn-scene-playlist-stop type-icon" data-playlist-id="${Handlebars.escapeExpression(entry.playlistId)}" title="${stopLabel}" aria-label="${stopLabel}">
              <i class="fas fa-stop" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="director-audio-playlist-contents" ${entry.isExpanded ? "" : "hidden"}>
          ${entry.tracks.map(track => this.#renderSceneAudioTrack(track, true)).join("")}
        </div>
      </div>
    `;
  }

  #renderSceneAudioTrack(track, isPlaylistTrack = false) {
    const isPlaying = track.playState === "playing";
    const isPaused = track.playState === "paused";
    const playLabel = game.i18n.localize(isPlaying
      ? "NARRATIVE_CANVAS.Director.Pause"
      : "NARRATIVE_CANVAS.Director.Play");
    const stopLabel = game.i18n.localize("NARRATIVE_CANVAS.Director.Stop");

    return `
      <div class="director-audio-track-item ${isPlaylistTrack ? "is-playlist-track" : ""} ${isPlaying ? "is-playing" : ""} ${isPaused ? "is-paused" : ""}" data-track-id="${Handlebars.escapeExpression(track.id)}" data-track-path="${Handlebars.escapeExpression(track.path)}" data-track-name="${Handlebars.escapeExpression(track.name)}">
        <div class="audio-track-info">
          <span class="audio-track-name" title="${Handlebars.escapeExpression(track.name)}">
            <i class="fas fa-volume-up track-status-icon"></i> ${Handlebars.escapeExpression(track.name)}
          </span>
          <div class="audio-track-actions">
            <button type="button" class="btn-track-toggle type-icon" title="${playLabel}" aria-label="${playLabel}">
              <i class="fas ${isPlaying ? "fa-pause" : "fa-play"}" aria-hidden="true"></i>
            </button>
            <button type="button" class="btn-track-stop type-icon" title="${stopLabel}" aria-label="${stopLabel}">
              <i class="fas fa-stop" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  #getAudioTracksWithPlaybackState() {
    return (this.#currentSceneData?.tracks ?? []).map(track => {
      const playlists = game.playlists ?? game.collections?.get("Playlist");
      let playlist = track.sourcePlaylistId
        ? game.playlists?.get(track.sourcePlaylistId)
          ?? game.collections?.get("Playlist")?.get(track.sourcePlaylistId)
        : null;
      let playlistSound = playlist?.sounds?.get(track.id);
      if (!playlist && track.uuid) {
        try {
          playlistSound = foundry.utils.fromUuidSync(track.uuid);
          playlist = playlistSound?.parent?.documentName === "Playlist" ? playlistSound.parent : null;
        } catch {}
      }
      if (!playlist && playlists) {
        playlist = Array.from(playlists).find(candidate => candidate.sounds?.has(track.id)) ?? null;
        playlistSound = playlist?.sounds?.get(track.id);
      }
      const playState = playlistSound?.playing || playlistSound?.sound?.playing
        ? "playing"
        : Number(playlistSound?.pausedTime) > 0
          ? "paused"
          : "stopped";

      return {
        ...track,
        playState
      };
    });
  }

  #getNowPlayingText(tracks) {
    const playingTrack = tracks.find(track => track.playState === "playing");
    if (!playingTrack) return "Now Playing: —";

    const playlistName = playingTrack.sourcePlaylistId
      ? playingTrack.sourcePlaylistName
        || game.playlists?.get(playingTrack.sourcePlaylistId)?.name
        || game.collections?.get("Playlist")?.get(playingTrack.sourcePlaylistId)?.name
        || game.i18n.localize("NARRATIVE_CANVAS.Editor.AudioPlaylist")
      : null;
    const trackName = playlistName
      ? `${playlistName} / ${playingTrack.name}`
      : playingTrack.name;

    return `Now Playing: ${trackName}`;
  }

  #updateNowPlayingDisplay(tracks) {
    const display = this.#audioControlsRoot?.querySelector(".audio-now-playing");
    if (!display) return;

    const text = this.#getNowPlayingText(tracks);
    display.textContent = text;
    display.title = text;
  }

  async #prepareTemplateData() {
    const restoredState = {
      journalId: this.#selectedJournalId,
      pageId: this.#selectedPageId
    };
    const scenesWithJournalNames = this.#scenesList.map(scene => {
      let journalName = scene.journalName;
      if (scene.journalId && !journalName) {
        journalName = game.journal?.get(scene.journalId)?.name
          ?? game.collections?.get("JournalEntry")?.get(scene.journalId)?.name;
      }
      return {
        ...scene,
        journalName
      };
    });

    let activeJournal = this.#selectedJournalId
      ? await JournalBrowser.getJournalDetails(this.#selectedJournalId)
      : null;
    if (activeJournal && JournalBrowser.getJournals().some(journal => journal.id === activeJournal.id)) {
      this.#currentJournalFolderId = activeJournal.folderId ?? "";
    }

    const { folders: childFolders, journals: availableJournals } = JournalBrowser.getLevelContents(
      this.#currentJournalFolderId,
      this.#journalQuery
    );
    this.#linkedJournalOption = null;

    if (this.#selectedJournalId && !availableJournals.some(journal => journal.id === this.#selectedJournalId)) {
      if (activeJournal) {
        this.#linkedJournalOption = { id: this.#selectedJournalId, name: activeJournal.name };
      } else {
        this.#selectedJournalId = "";
        this.#selectedPageId = "";
        activeJournal = null;
      }
    }

    let activePage = null;
    if (activeJournal?.pages.length) {
      activePage = activeJournal.pages.find(page => page.id === this.#selectedPageId) ?? activeJournal.pages[0];
      if (activePage) this.#selectedPageId = activePage.id;
    }

    if (restoredState.journalId !== this.#selectedJournalId
      || restoredState.pageId !== this.#selectedPageId) {
      void this.#saveJournalViewerState();
    }

    const currentFolder = JournalBrowser.getFolders().find(folder => folder.id === this.#currentJournalFolderId);

    return {
      scenes: scenesWithJournalNames,
      filteredScenes: scenesWithJournalNames,
      sceneQuery: this.#sceneQuery,
      filterByJournal: this.#filterByJournal,
      autoActivateFirstSceneOnJournalChange: this.#autoActivateFirstSceneOnJournalChange,
      isCollapsed: this.#isCollapsed,
      isScenesCollapsed: this.#areScenesCollapsed,
      isJournalCollapsed: this.#isJournalCollapsed,
      activeSceneId: this.#activeSceneId,
      currentSceneName: this.#activeSceneId
        ? this.#currentSceneData?.name ?? game.i18n.localize("NARRATIVE_CANVAS.Director.NoActiveScene")
        : game.i18n.localize("NARRATIVE_CANVAS.Director.NoActiveScene"),
      journalQuery: this.#journalQuery,
      childFolders,
      availableJournals,
      linkedJournalOption: this.#linkedJournalOption,
      currentJournalFolderLabel: currentFolder?.path ?? game.i18n.localize("NARRATIVE_CANVAS.Director.AllFolders"),
      canNavigateUp: this.#currentJournalFolderId !== this.#rootJournalFolderId,
      canGoBack: this.#journalNavigationHistory.length > 0,
      selectedJournalId: this.#selectedJournalId,
      activeJournal,
      selectedPageId: this.#selectedPageId,
      activePage,
    };
  }

  #updateActiveSceneName() {
    const sceneNameElement = this.#element?.querySelector(".sidebar-active-scene-name");
    if (!sceneNameElement) return;

    const hasActiveScene = Boolean(this.#activeSceneId);
    const sceneName = hasActiveScene
      ? this.#currentSceneData?.name ?? game.i18n.localize("NARRATIVE_CANVAS.Director.NoActiveScene")
      : game.i18n.localize("NARRATIVE_CANVAS.Director.NoActiveScene");
    sceneNameElement.textContent = sceneName;
    sceneNameElement.title = sceneName;
    sceneNameElement.classList.toggle("is-empty", !hasActiveScene);

    const clearButton = this.#element.querySelector(".btn-clear-active-scene");
    if (clearButton) clearButton.hidden = !hasActiveScene;
  }

  #bindListeners(root) {
    this.#bindPanelResize(root);
    this.#bindResizableSections(root);
    this.#bindSceneFilter(root);
    this.#bindSceneSelection(root);
    this.#bindContentLinks(root);
    this.#bindJournalNavigation(root);
    this.#bindJournalControls(root);
    this.#bindTocScrolling(root);
    this.#bindPageSelection(root);
    this.#addImageOverlayButtons(root);
  }

  #bindPanelResize(root) {
    const panel = root.matches(".narrative-director-sidebar")
      ? root
      : root.querySelector(".narrative-director-sidebar");
    const handle = panel?.querySelector(".btn-resize-director-panel");
    if (!panel || !handle) return;

    this.#panelResizeController = new ResizablePanelController({
      panel,
      handle,
      edge: "right",
      minWidth: 50,
      minContentWidth: 150,
      maxWidth: 560,
      getMaxWidth: () => Math.min(560, window.innerWidth * 0.45),
      initialWidth: this.#panelWidth + this.#panelOverflowOffset,
      isCollapsed: () => panel.classList.contains("is-collapsed"),
      onResize: width => {
        this.#panelWidth = width;
        this.#scheduleLayoutStateSave();
      },
      onOverflow: offset => {
        this.#panelOverflowOffset = offset;
        panel.style.setProperty("--nc-panel-overflow-offset", `${offset}px`);
        this.#scheduleLayoutStateSave();
      },
      onToggle: () => {
        this.toggleCollapse();
        if (!this.#isCollapsed) {
          this.#panelOverflowOffset = 0;
          panel.style.removeProperty("--nc-panel-overflow-offset");
        }
        this.#scheduleLayoutStateSave();
      }
    });
  }

  #destroyPanelResizeController() {
    this.#panelResizeController?.destroy();
    this.#panelResizeController = null;
  }

  #destroyResizableSections() {
    this.#resizableSections.forEach(section => section.destroy());
    this.#resizableSections = [];
  }

  #bindResizableSections(root) {
    const availableHeight = root.clientHeight || Math.max(1, window.innerHeight - 50);
    const sectionConfigs = [
      {
        name: "scenes",
        sectionSelector: ".sidebar-scenes-section",
        contentSelector: "#director-scenes-content",
        isCollapsed: this.#areScenesCollapsed,
        isResizable: false,
        expandedHeight: this.#getSavedSectionHeight("scenes", this.#sceneSectionHeight, availableHeight),
        expandLabel: "NARRATIVE_CANVAS.Director.ExpandScenes",
        collapseLabel: "NARRATIVE_CANVAS.Director.CollapseScenes"
      },
      {
        name: "journal",
        sectionSelector: ".sidebar-journal-section",
        contentSelector: "#director-journal-content",
        isCollapsed: this.#isJournalCollapsed,
        expandedHeight: this.#getSavedSectionHeight("journal", this.#journalSectionHeight, availableHeight),
        expandLabel: "NARRATIVE_CANVAS.Director.ExpandJournalViewer",
        collapseLabel: "NARRATIVE_CANVAS.Director.CollapseJournalViewer"
      },
    ];

    for (const config of sectionConfigs) {
      const section = root.querySelector(config.sectionSelector);
      const header = section?.querySelector(":scope > .sidebar-section-header");
      const content = section?.querySelector(config.contentSelector);
      const toggleButton = header?.querySelector(`[data-section-toggle="${config.name}"]`);
      if (!section || !header || !content || !toggleButton) continue;

      const controller = new ResizableSectionController({
        section,
        header,
        content,
        toggleButton,
        isCollapsed: config.isCollapsed,
        isResizable: config.isResizable ?? true,
        expandedHeight: config.expandedHeight,
        minHeight: 100,
        getMaxHeight: () => Math.max(
          100,
          (section.parentElement?.clientHeight ?? window.innerHeight) - 180
        ),
        createResizeHandler: resizeContext => this.#createSidebarResizeHandler(section, resizeContext),
        onBeforeToggle: () => this.#captureSidebarSectionHeights(),
        onToggle: toggleState => this.#resizeAdjacentSidebarSection(section, toggleState),
        applyHeight: state => this.#applySidebarSectionHeight(section, state),
        onChange: state => {
          if (config.name === "scenes") {
            this.#areScenesCollapsed = state.isCollapsed;
            this.#sceneSectionHeight = state.expandedHeight;
          } else if (config.name === "journal") {
            this.#isJournalCollapsed = state.isCollapsed;
            this.#journalSectionHeight = state.expandedHeight;
          }
          this.#scheduleLayoutStateSave();
        },
        expandLabel: config.expandLabel,
        collapseLabel: config.collapseLabel
      });
      this.#resizableSections.push(controller);
    }
  }

  #applySidebarSectionHeight(section, { isCollapsed, expandedHeight }) {
    if (isCollapsed) {
      section.style.flex = "0 0 auto";
      section.style.maxHeight = "none";
      return;
    }

    if (expandedHeight === null) {
      section.style.removeProperty("flex");
      section.style.removeProperty("max-height");
      return;
    }

    section.style.flex = `1 1 ${expandedHeight}px`;
    section.style.maxHeight = "none";
  }

  #createSidebarResizeHandler(section, { startHeight, wasCollapsed }) {
    const previousSection = section.previousElementSibling;
    if (!previousSection?.classList.contains("sidebar-scenes-section")
      && !previousSection?.classList.contains("sidebar-journal-section")) return null;

    const previousHeight = previousSection.getBoundingClientRect().height;
    const previousIsCollapsed = previousSection.classList.contains("is-collapsed");
    const minCurrentHeight = wasCollapsed ? startHeight : 100;
    const minPreviousHeight = previousIsCollapsed ? previousHeight : 100;
    const pairHeight = startHeight + previousHeight;

    return ({ requestedHeight }) => {
      const maxCurrentHeight = Math.max(minCurrentHeight, pairHeight - minPreviousHeight);
      const currentHeight = Math.max(
        minCurrentHeight,
        Math.min(maxCurrentHeight, requestedHeight)
      );
      const nextPreviousHeight = pairHeight - currentHeight;

      this.#applySidebarSectionHeight(previousSection, {
        isCollapsed: previousIsCollapsed,
        expandedHeight: nextPreviousHeight
      });
      this.#rememberSidebarSectionHeight(previousSection, nextPreviousHeight);
      return currentHeight;
    };
  }

  #rememberSidebarSectionHeight(section, height) {
    if (section.classList.contains("is-collapsed")) return;
    if (section.classList.contains("sidebar-scenes-section")) this.#sceneSectionHeight = height;
    else if (section.classList.contains("sidebar-journal-section")) this.#journalSectionHeight = height;
    this.#scheduleLayoutStateSave();
  }

  #getSavedSectionHeight(sectionName, currentHeight, availableHeight) {
    const savedRatio = this.#layoutState.sidebarSectionHeightRatios[sectionName];
    return typeof savedRatio === "number"
      ? savedRatio * availableHeight
      : currentHeight;
  }

  #scheduleLayoutStateSave() {
    const availableWidth = Math.max(1, window.innerWidth);
    const availableHeight = this.#element?.clientHeight || Math.max(1, window.innerHeight - 50);
    const sidebarSectionHeightRatios = { ...this.#layoutState.sidebarSectionHeightRatios };
    for (const [sectionName, height] of Object.entries({
      scenes: this.#sceneSectionHeight,
      journal: this.#journalSectionHeight
    })) {
      if (height !== null) sidebarSectionHeightRatios[sectionName] = height / availableHeight;
    }

    this.#layoutState = {
      ...this.#layoutState,
      panelWidthRatios: {
        ...this.#layoutState.panelWidthRatios,
        sidebar: Math.max(0, this.#panelWidth + this.#panelOverflowOffset) / availableWidth
      },
      sidebarSectionHeightRatios
    };

    if (this.#layoutStateSaveTimeout !== null) clearTimeout(this.#layoutStateSaveTimeout);
    this.#layoutStateSaveTimeout = window.setTimeout(() => {
      this.#layoutStateSaveTimeout = null;
      void NarrativeSettings.saveDirectorLayoutState({
        panelWidthRatios: { sidebar: this.#layoutState.panelWidthRatios.sidebar },
        sidebarSectionHeightRatios: this.#layoutState.sidebarSectionHeightRatios
      });
    }, 250);
  }

  #captureSidebarSectionHeights() {
    return [...this.#element.children]
      .filter(section => section.matches(
        ".sidebar-scenes-section, .sidebar-journal-section"
      ))
      .map(section => ({
        section,
        height: section.getBoundingClientRect().height,
        isCollapsed: section.classList.contains("is-collapsed")
      }));
  }

  #resizeAdjacentSidebarSection(section, { previousHeight, currentHeight, snapshot }) {
    if (!snapshot) return;

    const heightChange = currentHeight - previousHeight;
    const adjacentSection = section.nextElementSibling ?? section.previousElementSibling;
    const adjacentState = snapshot.find(item => item.section === adjacentSection);

    snapshot.forEach(item => {
      if (item.section === section) return;

      const shouldResizeAdjacent = item === adjacentState && !item.isCollapsed;
      const expandedHeight = shouldResizeAdjacent
        ? Math.max(100, item.height - heightChange)
        : item.height;
      this.#applySidebarSectionHeight(item.section, {
        isCollapsed: item.isCollapsed,
        expandedHeight
      });
      this.#rememberSidebarSectionHeight(item.section, expandedHeight);
    });
  }

  #addImageOverlayButtons(root) {
    root.querySelectorAll(".journal-page-body img").forEach(image => {
      if (image.closest(".journal-image-overlay-target")) return;

      const wrapper = document.createElement("span");
      wrapper.className = "journal-image-overlay-target";
      image.before(wrapper);
      wrapper.appendChild(image);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-journal-image-overlay";
      button.title = game.i18n.localize("NARRATIVE_CANVAS.Director.ShowImageOverlay");
      button.setAttribute("aria-label", button.title);
      button.innerHTML = '<i class="fas fa-expand-alt" aria-hidden="true"></i>';
      wrapper.appendChild(button);
    });
  }

  #bindSceneFilter(root) {
    const input = root.querySelector(".input-scenes-filter");
    input?.addEventListener("input", (event) => {
      this.#sceneQuery = event.target.value.trim().toLowerCase();
      this.#applySceneFilters();
    });

    const journalCheckbox = root.querySelector(".input-filter-by-journal");
    journalCheckbox?.addEventListener("change", (event) => {
      this.#filterByJournal = event.target.checked;
      this.#applySceneFilters();
    });

    const autoActivateCheckbox = root.querySelector(".input-auto-activate-first-scene");
    autoActivateCheckbox?.addEventListener("change", (event) => {
      this.#autoActivateFirstSceneOnJournalChange = event.target.checked;
    });
  }

  /**
   * Filters the scenes list in the DOM based on current text query and journal selection filter.
   * NOTE: Filtering does NOT modify the currently active scene.
   * @private
   */
  #applySceneFilters() {
    if (!this.#element) return;

    const query = this.#sceneQuery;
    const filterByJournal = this.#filterByJournal;
    const selectedJournalId = this.#selectedJournalId;

    const items = this.#element.querySelectorAll(".director-scene-item");
    let visibleCount = 0;

    items.forEach(item => {
      const sceneJournalId = item.dataset.journalId || "";
      const name = item.querySelector(".scene-item-name")?.textContent.toLowerCase() ?? "";
      const journalName = item.querySelector(".scene-item-journal")?.textContent.toLowerCase() ?? "";

      const matchesText = !query || name.includes(query) || journalName.includes(query);
      const matchesJournal = !filterByJournal || !selectedJournalId || sceneJournalId === selectedJournalId;

      const isVisible = matchesText && matchesJournal;
      item.style.display = isVisible ? "" : "none";
      if (isVisible) visibleCount++;
    });

    let hint = this.#element.querySelector(".sidebar-scenes-section .sidebar-empty-hint");
    if (!hint && visibleCount === 0) {
      hint = document.createElement("div");
      hint.className = "sidebar-empty-hint";
      hint.textContent = game.i18n.localize("NARRATIVE_CANVAS.Director.NoScenes");
      this.#element.querySelector(".director-scenes-list")?.appendChild(hint);
    } else if (hint) {
      hint.style.display = visibleCount === 0 ? "" : "none";
    }
  }

  #activateFirstVisibleSceneIfNeeded() {
    if (!this.#autoActivateFirstSceneOnJournalChange) return;

    const visibleItems = [...(this.#element?.querySelectorAll(".director-scene-item") ?? [])]
      .filter(item => item.style.display !== "none");
    if (visibleItems.some(item => item.dataset.sceneId === this.#activeSceneId)) return;

    const firstItem = visibleItems[0];
    if (!firstItem) return;

    this.#activeSceneId = firstItem.dataset.sceneId;
    this.#currentSceneData = this.#scenesList.find(scene => scene.id === this.#activeSceneId) ?? null;
    this.#element.querySelectorAll(".director-scene-item").forEach(item => {
      item.classList.toggle("is-active", item === firstItem);
    });
    this.#updateActiveSceneName();
    this.#callbacks.onSceneSelect?.(this.#activeSceneId);
  }

  #bindSceneSelection(root) {
    root.querySelector(".director-scenes-list")?.addEventListener("click", (event) => {
      const item = event.target.closest(".director-scene-item");
      if (!item) return;

      const sceneId = item.dataset.sceneId;
      if (!sceneId) return;

      this.#activeSceneId = sceneId;
      root.querySelectorAll(".director-scene-item").forEach(candidate => {
        candidate.classList.toggle("is-active", candidate.dataset.sceneId === sceneId);
      });
      this.#updateActiveSceneName();

      this.#callbacks.onSceneSelect?.(sceneId);
    });

    root.querySelector(".btn-clear-active-scene")?.addEventListener("click", event => {
      event.preventDefault();
      this.#activeSceneId = "";
      root.querySelectorAll(".director-scene-item").forEach(candidate => candidate.classList.remove("is-active"));
      this.#updateActiveSceneName();
      this.#callbacks.onSceneSelect?.(null);
    });
  }

  #bindJournalControls(root) {
    const journalFilterInput = root.querySelector(".input-journal-filter");
    const journalSelect = root.querySelector(".select-journal-entry");
    root.querySelector(".btn-journal-folder-up")?.addEventListener("click", (event) => {
      event.preventDefault();
      this.#navigateToParentFolder();
    });

    journalFilterInput?.addEventListener("input", (event) => {
      this.#journalQuery = event.target.value;
      this.#refreshJournalSelect();
      this.#scheduleJournalViewerStateSave();
    });

    journalFilterInput?.addEventListener("change", () => {
      void this.#saveJournalViewerState();
    });

    journalSelect?.addEventListener("change", (event) => {
      const selectedValue = event.target.value;
      if (selectedValue.startsWith("folder:")) {
        this.#navigateToFolder(selectedValue.slice("folder:".length));
        return;
      }

      this.#selectedJournalId = selectedValue.startsWith("journal:")
        ? selectedValue.slice("journal:".length)
        : "";
      this.#selectedPageId = "";
      const selectedOption = event.target.selectedOptions[0];
      this.#linkedJournalOption = selectedOption?.dataset.linkedJournal
        ? { id: this.#selectedJournalId, name: selectedOption.textContent }
        : null;
      void this.#refreshJournalBody();
      this.#applySceneFilters();
      this.#activateFirstVisibleSceneIfNeeded();
      void this.#saveJournalViewerState();
    });
  }

  #refreshJournalSelect() {
    const journalSelect = this.#element?.querySelector(".select-journal-entry");
    if (!journalSelect) return;

    const { folders, journals } = JournalBrowser.getLevelContents(
      this.#currentJournalFolderId,
      this.#journalQuery
    );

    journalSelect.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = game.i18n.localize("NARRATIVE_CANVAS.Director.SelectJournalOrFolder");
    journalSelect.appendChild(defaultOption);

    if (folders.length) {
      const folderGroup = document.createElement("optgroup");
      folderGroup.label = game.i18n.localize("NARRATIVE_CANVAS.Director.Subfolders");
      folders.forEach(folder => {
        const option = document.createElement("option");
        option.value = `folder:${folder.id}`;
        option.textContent = folder.name;
        folderGroup.appendChild(option);
      });
      journalSelect.appendChild(folderGroup);
    }

    const journalGroup = document.createElement("optgroup");
    journalGroup.label = game.i18n.localize("NARRATIVE_CANVAS.Director.Journals");
    journals.forEach(journal => {
      const option = document.createElement("option");
      option.value = `journal:${journal.id}`;
      option.textContent = journal.name;
      journalGroup.appendChild(option);
    });

    if (this.#linkedJournalOption && !journals.some(journal => journal.id === this.#linkedJournalOption.id)) {
      const option = document.createElement("option");
      option.value = `journal:${this.#linkedJournalOption.id}`;
      option.textContent = this.#linkedJournalOption.name;
      option.dataset.linkedJournal = "true";
      journalGroup.appendChild(option);
    }
    if (journalGroup.children.length) journalSelect.appendChild(journalGroup);

    if (this.#selectedJournalId && !journals.some(journal => journal.id === this.#selectedJournalId)
      && this.#linkedJournalOption?.id !== this.#selectedJournalId) {
      this.#selectedJournalId = "";
      this.#selectedPageId = "";
      void this.#refreshJournalBody();
      this.#applySceneFilters();
    }

    journalSelect.value = this.#selectedJournalId ? `journal:${this.#selectedJournalId}` : "";
    this.#updateJournalFolderNavigation();
  }

  #navigateToFolder(folderId) {
    this.#currentJournalFolderId = folderId;
    this.#selectedJournalId = "";
    this.#selectedPageId = "";
    this.#linkedJournalOption = null;
    this.#refreshJournalSelect();
    void this.#refreshJournalBody();
    this.#applySceneFilters();
    void this.#saveJournalViewerState();
  }

  #navigateToParentFolder() {
    if (this.#currentJournalFolderId === this.#rootJournalFolderId) return;

    const rootSubtree = this.#rootJournalFolderId
      ? JournalBrowser.getFolderSubtreeIds(this.#rootJournalFolderId)
      : null;
    const isWithinRoot = !rootSubtree || rootSubtree.has(this.#currentJournalFolderId);
    const parentFolderId = JournalBrowser.getParentFolderId(this.#currentJournalFolderId);
    const nextFolderId = isWithinRoot
      ? (parentFolderId ?? "")
      : this.#rootJournalFolderId;
    this.#navigateToFolder(nextFolderId);
  }

  #updateJournalFolderNavigation() {
    const button = this.#element?.querySelector(".btn-journal-folder-up");
    const label = this.#element?.querySelector(".journal-current-folder");
    if (button) button.disabled = this.#currentJournalFolderId === this.#rootJournalFolderId;
    if (label) {
      const folder = JournalBrowser.getFolders().find(item => item.id === this.#currentJournalFolderId);
      label.textContent = folder?.path ?? game.i18n.localize("NARRATIVE_CANVAS.Director.AllFolders");
      label.title = label.textContent;
    }
  }

  #bindContentLinks(root) {
    const journalSection = root.querySelector(".sidebar-journal-section");
    if (!journalSection) return;

    journalSection.addEventListener("click", (event) => {
      const link = event.target.closest?.("a.content-link[data-uuid]");
      if (!link || !journalSection.contains(link)) return;

      const uuid = link.dataset.uuid;
      const uuidParts = uuid.split(".");
      const isJournalLink = ["JournalEntry", "JournalEntryPage"].includes(link.dataset.type)
        || uuidParts.some(part => part === "JournalEntry" || part === "JournalEntryPage");

      if (isJournalLink) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.#openJournalLink(uuid);
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      void this.#openLinkedDocument(event, uuid);
    }, true);
  }

  async #openLinkedDocument(event, uuid) {
    try {
      const linkedDocument = await foundry.utils.fromUuid(uuid);
      const application = await linkedDocument?._onClickDocumentLink(event);
      if (application) this.#raiseLinkedDocument(application);
    } catch (error) {
      console.warn("Narrative Canvas | Failed to open linked document:", uuid, error);
    }
  }

  #bindJournalNavigation(root) {
    root.querySelector(".btn-journal-back")?.addEventListener("click", (event) => {
      event.preventDefault();
      void this.#goBackJournal();
    });
  }

  async #openJournalLink(uuid) {
    let linkedDocument;
    try {
      linkedDocument = await foundry.utils.fromUuid(uuid);
    } catch (error) {
      console.warn("Narrative Canvas | Failed to resolve journal link:", uuid, error);
      return;
    }

    const isPage = linkedDocument?.documentName === "JournalEntryPage";
    const journal = isPage ? linkedDocument.parent : linkedDocument;
    if (journal?.documentName !== "JournalEntry") return;

    this.#journalNavigationHistory.push({
      folderId: this.#currentJournalFolderId,
      query: this.#journalQuery,
      journalId: this.#selectedJournalId,
      pageId: this.#selectedPageId,
      filterByJournal: this.#filterByJournal,
      linkedJournalOption: this.#linkedJournalOption ? { ...this.#linkedJournalOption } : null
    });
    this.#updateJournalBackButton();

    const isWorldJournal = JournalBrowser.getJournals().some(entry => entry.id === journal.id);
    this.#currentJournalFolderId = isWorldJournal
      ? (typeof journal.folder === "string" ? journal.folder : journal.folder?.id ?? "")
      : this.#rootJournalFolderId;
    this.#selectedJournalId = isWorldJournal ? journal.id : journal.uuid;
    this.#selectedPageId = isPage ? linkedDocument.id : "";
    const { journals: availableJournals } = JournalBrowser.getLevelContents(
      this.#currentJournalFolderId,
      this.#journalQuery
    );
    this.#linkedJournalOption = availableJournals.some(entry => entry.id === this.#selectedJournalId)
      ? null
      : { id: this.#selectedJournalId, name: journal.name };

    if (!isWorldJournal) {
      this.#filterByJournal = false;
      const filterToggle = this.#element?.querySelector(".input-filter-by-journal");
      if (filterToggle) filterToggle.checked = false;
    }

    if (!isPage) {
      const details = await JournalBrowser.getJournalDetails(this.#selectedJournalId);
      this.#selectedPageId = details?.pages[0]?.id ?? "";
    }

    this.#updateJournalFolderNavigation();
    this.#refreshJournalSelect();
    await this.#refreshJournalBody();
    this.#applySceneFilters();
    void this.#saveJournalViewerState();
  }

  async #goBackJournal() {
    const previousState = this.#journalNavigationHistory.pop();
    if (!previousState) return;

    this.#currentJournalFolderId = previousState.folderId;
    this.#journalQuery = previousState.query;
    this.#selectedJournalId = previousState.journalId;
    this.#selectedPageId = previousState.pageId;
    this.#filterByJournal = previousState.filterByJournal;
    this.#linkedJournalOption = previousState.linkedJournalOption;

    const journalFilterInput = this.#element?.querySelector(".input-journal-filter");
    const filterToggle = this.#element?.querySelector(".input-filter-by-journal");
    if (journalFilterInput) journalFilterInput.value = this.#journalQuery;
    if (filterToggle) filterToggle.checked = this.#filterByJournal;

    this.#refreshJournalSelect();
    await this.#refreshJournalBody();
    this.#applySceneFilters();
    this.#updateJournalBackButton();
    void this.#saveJournalViewerState();
  }

  #updateJournalBackButton() {
    const backButton = this.#element?.querySelector(".btn-journal-back");
    if (backButton) backButton.hidden = this.#journalNavigationHistory.length === 0;
  }

  #raiseLinkedDocument(application) {
    const contentElement = application.element?.[0] ?? application.element;
    const windowElement = contentElement?.closest?.(".application, .window-app") ?? contentElement;
    if (!windowElement?.isConnected) return;

    application.bringToTop?.();
  }

  #scheduleJournalViewerStateSave() {
    if (this.#journalStateSaveTimeout !== null) {
      clearTimeout(this.#journalStateSaveTimeout);
    }

    this.#journalStateSaveTimeout = setTimeout(() => {
      this.#journalStateSaveTimeout = null;
      void this.#saveJournalViewerState();
    }, 300);
  }

  async #saveJournalViewerState() {
    if (this.#journalStateSaveTimeout !== null) {
      clearTimeout(this.#journalStateSaveTimeout);
      this.#journalStateSaveTimeout = null;
    }

    try {
      await NarrativeSettings.saveJournalViewerState({
        query: this.#journalQuery,
        journalId: this.#selectedJournalId,
        pageId: this.#selectedPageId
      });
    } catch (error) {
      console.error("Narrative Canvas | Failed to save Journal Viewer state.", error);
    }
  }

  async #refreshJournalBody() {
    if (!this.#element) return;
    const bodyContainer = this.#element.querySelector(".journal-viewer-body");
    if (!bodyContainer) return;

    this.#callbacks.onJournalSelect?.(this.#selectedJournalId);
    const activeJournal = this.#selectedJournalId
      ? await JournalBrowser.getJournalDetails(this.#selectedJournalId)
      : null;

    let activePage = null;
    if (activeJournal?.pages.length) {
      activePage = activeJournal.pages.find(page => page.id === this.#selectedPageId) ?? activeJournal.pages[0];
      if (activePage) this.#selectedPageId = activePage.id;
    }

    if (!activeJournal) {
      bodyContainer.innerHTML = `
        <div class="journal-viewer-placeholder">
          <i class="fas fa-book-reader"></i>
          <p>${game.i18n.localize("NARRATIVE_CANVAS.Director.NoJournalSelected")}</p>
        </div>`;
      return;
    }

    if (!activeJournal.pages.length) {
      bodyContainer.innerHTML = `<div class="sidebar-empty-hint">${game.i18n.localize("NARRATIVE_CANVAS.Director.NoPages")}</div>`;
      return;
    }

    const badgesHtml = activeJournal.pages.map(page => `
      <button type="button" class="journal-toc-badge ${page.id === this.#selectedPageId ? "is-active" : ""}" data-page-id="${page.id}" title="${Handlebars.escapeExpression(page.name)}">
        ${Handlebars.escapeExpression(page.name)}
      </button>
    `).join("");

    bodyContainer.innerHTML = `
      <div class="journal-toc-carousel">
        <button type="button" class="btn-toc-scroll btn-toc-prev" title="&lt;"><i class="fas fa-chevron-left"></i></button>
        <div class="journal-toc-track">${badgesHtml}</div>
        <button type="button" class="btn-toc-scroll btn-toc-next" title="&gt;"><i class="fas fa-chevron-right"></i></button>
      </div>
      <div class="journal-viewer-content">
        ${activePage ? `<h3 class="journal-page-title">${Handlebars.escapeExpression(activePage.name)}</h3><div class="journal-page-body">${activePage.content || `<p class="journal-empty-page-hint"><em>${game.i18n.localize("NARRATIVE_CANVAS.Director.EmptyPage")}</em></p>`}</div>` : ""}
      </div>
    `;

    this.#addImageOverlayButtons(bodyContainer);
    this.#bindTocScrolling(bodyContainer);
    this.#scrollSelectedPageBadgeIntoView(bodyContainer);
  }

  #scrollSelectedPageBadgeIntoView(root) {
    const track = root.querySelector(".journal-toc-track");
    const badge = track?.querySelector(".journal-toc-badge.is-active");
    if (!track || !badge) return;

    const trackBounds = track.getBoundingClientRect();
    const badgeBounds = badge.getBoundingClientRect();
    if (badgeBounds.left < trackBounds.left) {
      track.scrollBy({ left: badgeBounds.left - trackBounds.left, behavior: "smooth" });
    } else if (badgeBounds.right > trackBounds.right) {
      track.scrollBy({ left: badgeBounds.right - trackBounds.right, behavior: "smooth" });
    }
  }

  #bindTocScrolling(root) {
    const track = root.querySelector(".journal-toc-track");
    const prevBtn = root.querySelector(".btn-toc-prev");
    const nextBtn = root.querySelector(".btn-toc-next");
    if (!track) return;

    prevBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      track.scrollBy({ left: -140, behavior: "smooth" });
    });

    nextBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      track.scrollBy({ left: 140, behavior: "smooth" });
    });

    let isDown = false;
    let startX = 0;
    let initialScroll = 0;
    let isDragging = false;

    track.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      isDown = true;
      isDragging = false;
      startX = event.pageX;
      initialScroll = track.scrollLeft;
    });

    window.addEventListener("mousemove", (event) => {
      if (!isDown) return;
      const walk = event.pageX - startX;
      if (!isDragging && Math.abs(walk) > 6) {
        isDragging = true;
        track.classList.add("is-dragging");
      }
      if (isDragging) {
        track.scrollLeft = initialScroll - walk;
      }
    });

    window.addEventListener("mouseup", () => {
      if (!isDown) return;
      isDown = false;
      track.classList.remove("is-dragging");
      if (isDragging) {
        const preventClick = (e) => {
          e.stopPropagation();
          e.preventDefault();
        };
        track.addEventListener("click", preventClick, { capture: true, once: true });
        setTimeout(() => track.removeEventListener("click", preventClick, { capture: true }), 50);
      }
      isDragging = false;
    });
  }

  #bindPageSelection(root) {
    const journalSection = root.querySelector(".sidebar-journal-section") || root;
    journalSection.addEventListener("click", (event) => {
      const overlayButton = event.target.closest(".btn-journal-image-overlay");
      if (overlayButton) {
        event.preventDefault();
        const image = overlayButton.parentElement.querySelector("img");
        if (image) {
          this.#callbacks.onJournalImageShow?.({
            src: image.currentSrc || image.src,
            title: image.alt || this.#element.querySelector(".journal-page-title")?.textContent || ""
          });
        }
        return;
      }

      const badge = event.target.closest(".journal-toc-badge");
      if (!badge) return;

      event.preventDefault();
      const pageId = badge.dataset.pageId;
      if (pageId) {
        this.#selectPage(pageId);
      }
    });
  }

  async #selectPage(pageId) {
    if (!pageId) return;
    this.#selectedPageId = pageId;
    void this.#saveJournalViewerState();

    if (!this.#element) return;

    this.#element.querySelectorAll(".journal-toc-badge").forEach(candidate => {
      const isActive = candidate.dataset.pageId === pageId;
      candidate.classList.toggle("is-active", isActive);
      if (isActive) {
        candidate.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    });

    const details = await JournalBrowser.getJournalDetails(this.#selectedJournalId);
    const page = details?.pages.find(p => p.id === pageId);
    const contentContainer = this.#element.querySelector(".journal-viewer-content");
    if (contentContainer && page) {
      const emptyText = game.i18n.localize("NARRATIVE_CANVAS.Director.EmptyPage");
      contentContainer.innerHTML = `
        <h3 class="journal-page-title">${Handlebars.escapeExpression(page.name)}</h3>
        <div class="journal-page-body">${page.content || `<p class="journal-empty-page-hint"><em>${emptyText}</em></p>`}</div>
      `;
      this.#addImageOverlayButtons(contentContainer);
      contentContainer.scrollTop = 0;
    }
  }

  #bindAudioControls(audioSection) {
    if (!audioSection) return;

    // Track play/pause and stop clicks
    audioSection.addEventListener("click", async (event) => {
      const scenePlaylistExpandButton = event.target.closest(".btn-scene-playlist-expand");
      if (scenePlaylistExpandButton) {
        event.preventDefault();
        const playlistId = scenePlaylistExpandButton.dataset.playlistId;
        if (this.#expandedPlaylistIds.has(playlistId)) this.#expandedPlaylistIds.delete(playlistId);
        else this.#expandedPlaylistIds.add(playlistId);
        this.#refreshAudioTracksList();
        return;
      }

      const scenePlaylistToggleButton = event.target.closest(".btn-scene-playlist-toggle");
      if (scenePlaylistToggleButton) {
        event.preventDefault();
        await this.#togglePlaylistPlayback(scenePlaylistToggleButton.dataset.playlistId);
        this.#refreshAudioTracksList();
        return;
      }

      const scenePlaylistStopButton = event.target.closest(".btn-scene-playlist-stop");
      if (scenePlaylistStopButton) {
        event.preventDefault();
        await this.#stopPlaylistPlayback(scenePlaylistStopButton.dataset.playlistId);
        this.#refreshAudioTracksList();
        return;
      }

      const toggleBtn = event.target.closest(".btn-track-toggle");
      const stopBtn = event.target.closest(".btn-track-stop");
      const item = event.target.closest(".director-audio-track-item");
      if (!item) return;

      const trackId = item.dataset.trackId;
      const track = this.#currentSceneData?.tracks?.find(t => t.id === trackId)
        ?? { id: trackId, path: item.dataset.trackPath, name: item.dataset.trackName };

      if (!track?.path) {
        ui.notifications?.warn(game.i18n.localize("NARRATIVE_CANVAS.Director.InvalidAudioPath"));
        return;
      }

      if (toggleBtn) {
        event.preventDefault();
        await this.#toggleTrackPlayback(track);
        this.#refreshAudioTracksList();
        return;
      }

      if (stopBtn) {
        event.preventDefault();
        await this.#stopTrackPlayback(track);
        this.#refreshAudioTracksList();
        return;
      }
    });

    // Master / Global Volume Slider
    const masterSlider = audioSection.querySelector(".slider-master-volume");
    masterSlider?.addEventListener("input", (event) => {
      const val = parseFloat(event.target.value);
      if (this.#audioMixer) {
        this.#audioMixer.globalVolume = val;
      }
      this.#callbacks.onVolumeChange?.(val);

      const percentSpan = audioSection.querySelector(".master-volume-percent");
      if (percentSpan) {
        percentSpan.textContent = `${Math.round(val * 100)}%`;
      }
    });
  }

  async #toggleTrackPlayback(track) {
    NarrativeLogger.debug("Director toggled scene audio track", {
      trackId: track.id,
      trackName: track.name,
      sourcePlaylistId: track.sourcePlaylistId || null
    });
    if (!track.sourcePlaylistId) {
      NarrativeLogger.warn("Cannot play scene audio that is not linked to a Foundry PlaylistSound", {
        trackId: track.id,
        trackName: track.name
      });
      return;
    }

    const playlist = game.playlists?.get(track.sourcePlaylistId)
      ?? game.collections?.get("Playlist")?.get(track.sourcePlaylistId);
    const sound = playlist?.sounds?.get(track.id);
    if (!playlist || !sound) {
      NarrativeLogger.warn("Cannot toggle Foundry Playlist track; playlist or sound was not found", {
        trackId: track.id,
        playlistId: track.sourcePlaylistId
      });
      return;
    }
    if (sound.playing || sound.sound?.playing) {
      this.#activePlaylistIds.add(playlist.id);
      const currentTime = Number(sound.sound?.currentTime);
      const pausedTime = Number(sound.pausedTime);
      await sound.update({
        playing: false,
        pausedTime: Number.isFinite(currentTime) ? currentTime : Number.isFinite(pausedTime) ? pausedTime : 0
      });
    } else {
      await this.#stopOtherSceneAudio({
        playlistId: playlist.id,
        trackId: sound.id,
        isPlaylistGroup: false
      });
      await playlist.playSound(sound);
    }
  }

  async #stopOtherSceneAudio(target) {
    await stopOtherSceneAudio(
      this.#currentSceneData?.tracks,
      target,
      playlistId => game.playlists?.get(playlistId)
        ?? game.collections?.get("Playlist")?.get(playlistId)
    );
    this.#activePlaylistIds.clear();
    this.#activePlaylistIds.add(target.playlistId);
  }

  async #stopTrackPlayback(track) {
    if (!track.sourcePlaylistId) {
      NarrativeLogger.warn("Cannot stop scene audio that is not linked to a Foundry PlaylistSound", {
        trackId: track.id,
        trackName: track.name
      });
      return;
    }

    const playlist = game.playlists?.get(track.sourcePlaylistId)
      ?? game.collections?.get("Playlist")?.get(track.sourcePlaylistId);
    const sound = playlist?.sounds?.get(track.id);
    if (!sound) return;

    await playlist.stopSound(sound);
    const hasRemainingPlayback = (this.#currentSceneData?.tracks ?? [])
      .filter(item => item.sourcePlaylistId === track.sourcePlaylistId)
      .some(item => {
        const playlistSound = playlist.sounds.get(item.id);
        return playlistSound?.playing || playlistSound?.sound?.playing || Number(playlistSound?.pausedTime) > 0;
      });
    if (!hasRemainingPlayback) this.#activePlaylistIds.delete(playlist.id);
  }

  async #togglePlaylistPlayback(playlistId) {
    const playlist = game.playlists?.get(playlistId)
      ?? game.collections?.get("Playlist")?.get(playlistId);
    if (!playlist) {
      NarrativeLogger.warn("Cannot toggle playlist playback; playlist was not found", { playlistId });
      return;
    }

    const sceneTracks = (this.#currentSceneData?.tracks ?? [])
      .filter(track => track.sourcePlaylistId === playlistId)
      .map(track => playlist.sounds?.get(track.id))
      .filter(Boolean);
    const playingSounds = sceneTracks.filter(sound => sound.playing || sound.sound?.playing);
    NarrativeLogger.info("Toggling scene playlist playback", {
      playlistId,
      playlistName: playlist.name,
      trackCount: sceneTracks.length,
      action: playingSounds.length > 0 ? "pause" : "play"
    });

    if (playingSounds.length > 0) {
      this.#activePlaylistIds.add(playlistId);
      await Promise.all(playingSounds.map(sound => {
        const currentTime = Number(sound.sound?.currentTime);
        const pausedTime = Number(sound.pausedTime);
        return sound.update({
          playing: false,
          pausedTime: Number.isFinite(currentTime) ? currentTime : Number.isFinite(pausedTime) ? pausedTime : 0
        });
      }));
      return;
    }

    const pausedSounds = sceneTracks.filter(sound => Number(sound.pausedTime) > 0);
    await this.#stopOtherSceneAudio({ playlistId, isPlaylistGroup: true });
    if (pausedSounds.length === 0) {
      await playlist.playAll();
    } else if (playlist.mode === CONST.PLAYLIST_MODES.SIMULTANEOUS) {
      await Promise.all(pausedSounds.map(sound => playlist.playSound(sound)));
    } else {
      await playlist.playSound(pausedSounds[0]);
    }
  }

  async #stopPlaylistPlayback(playlistId) {
    const playlist = game.playlists?.get(playlistId)
      ?? game.collections?.get("Playlist")?.get(playlistId);
    if (!playlist) {
      NarrativeLogger.warn("Cannot stop playlist playback; playlist was not found", { playlistId });
      return;
    }

    NarrativeLogger.info("Stopping scene playlist", { playlistId, playlistName: playlist.name });
    await playlist.stopAll();
    await Promise.all(Array.from(playlist.sounds ?? [])
      .filter(sound => !sound.playing && Number(sound.pausedTime) > 0)
      .map(sound => sound.update({ playing: false, pausedTime: 0 })));
    this.#activePlaylistIds.delete(playlistId);
  }
}

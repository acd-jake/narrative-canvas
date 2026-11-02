import { JournalBrowser } from "../services/journal-browser.js";
import { NarrativeSceneRepository } from "../services/scene-repository.js";
import { NarrativeSettings } from "../services/settings.js";

/**
 * Controller for the Director Left Sidebar, managing filterable scenes,
 * a filterable journal viewer with a draggable/scrollable badge TOC,
 * and the active scene's audio playback & volume controls.
 */
export class DirectorSidebar {
  #callbacks;
  #audioController = null;
  #element = null;
  #sceneQuery = "";
  #filterByJournal = true;
  #autoActivateFirstSceneOnJournalChange = true;
  #isCollapsed = false;
  #areScenesCollapsed = true;
  #isAudioCollapsed = true;
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

  /**
   * @param {object} options
   * @param {SceneAudioController} options.audioController
  * @param {(sceneId: string|null) => void} options.onSceneSelect
  * @param {(journalId: string) => void} options.onJournalSelect
   * @param {(volume: number) => void} [options.onVolumeChange]
   * @param {(image: {src: string, title: string}) => void} [options.onJournalImageShow]
   */
  constructor({ audioController, onSceneSelect, onJournalSelect, onVolumeChange, onJournalImageShow }) {
    this.#audioController = audioController;
    this.#callbacks = { onSceneSelect, onJournalSelect, onVolumeChange, onJournalImageShow };

    const journalViewerState = NarrativeSettings.getJournalViewerState();
    this.#rootJournalFolderId = NarrativeSettings.getJournalRootFolder();
    this.#currentJournalFolderId = this.#rootJournalFolderId;
    this.#journalQuery = journalViewerState.query;
    this.#selectedJournalId = journalViewerState.journalId;
    this.#selectedPageId = journalViewerState.pageId;
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

    const toggleBtn = this.#element.querySelector(".sidebar-collapse-toggle");
    if (toggleBtn) {
      const title = this.#isCollapsed
        ? game.i18n.localize("NARRATIVE_CANVAS.Director.ExpandSidebar")
        : game.i18n.localize("NARRATIVE_CANVAS.Director.CollapseSidebar");
      toggleBtn.title = title;
      toggleBtn.setAttribute("aria-expanded", String(!this.#isCollapsed));
      const icon = toggleBtn.querySelector("i");
      if (icon) {
        icon.className = `fas ${this.#isCollapsed ? "fa-chevron-right" : "fa-chevron-left"}`;
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
    this.#scenesList = context.scenesList ?? NarrativeSceneRepository.getAll();
    this.#currentSceneData = context.currentSceneData ?? (this.#activeSceneId ? this.#scenesList.find(s => s.id === this.#activeSceneId) : null);

    if (context.globalVolume !== undefined && this.#audioController) {
      this.#audioController.globalVolume = context.globalVolume;
    }

    const templateData = await this.#prepareTemplateData();
    const htmlString = await renderTemplate("modules/narrative-canvas/templates/partials/director-sidebar.hbs", templateData);

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;

    this.#element = newElement;
    this.#bindListeners(this.#element);
    this.#updateCollapseState();
    this.#applySceneFilters();

    return newElement;
  }

  /**
   * Updates sidebar state in-place when scene or volume changes.
   * @param {object} context
   */
  update(context = {}) {
    if (!this.#element) return;
    this.#activeSceneId = context.activeSceneId ?? this.#activeSceneId;

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
    if (!this.#element) return;
    const tracksContainer = this.#element.querySelector(".director-audio-tracks-list");
    if (!tracksContainer) return;

    const rawTracks = this.#currentSceneData?.tracks ?? [];
    if (rawTracks.length === 0) {
      tracksContainer.innerHTML = `<div class="sidebar-empty-hint">${game.i18n.localize("NARRATIVE_CANVAS.Director.NoAudioTracks")}</div>`;
      return;
    }

    const activeSceneTracks = rawTracks.map(track => {
      const state = this.#audioController?.getTrackState(track.id) ?? "stopped";
      const vol = this.#audioController?.getTrackVolume(track.id) ?? 1.0;
      return {
        ...track,
        playState: state,
        volume: vol,
        volumePercent: Math.round(vol * 100)
      };
    });

    tracksContainer.innerHTML = activeSceneTracks.map(track => `
      <div class="director-audio-track-item ${track.playState === 'playing' ? 'is-playing' : ''} ${track.playState === 'paused' ? 'is-paused' : ''}" data-track-id="${track.id}" data-track-path="${track.path}" data-track-name="${track.name}">
        <div class="audio-track-info">
          <span class="audio-track-name" title="${Handlebars.escapeExpression(track.name)}">
            <i class="fas fa-volume-up track-status-icon"></i> ${Handlebars.escapeExpression(track.name)}
          </span>
          <div class="audio-track-actions">
            <button type="button" class="btn-track-toggle type-icon" title="${track.playState === 'playing' ? game.i18n.localize('NARRATIVE_CANVAS.Director.Pause') : game.i18n.localize('NARRATIVE_CANVAS.Director.Play')}">
              <i class="fas ${track.playState === 'playing' ? 'fa-pause' : 'fa-play'}"></i>
            </button>
            <button type="button" class="btn-track-stop type-icon" title="${game.i18n.localize('NARRATIVE_CANVAS.Director.Stop')}">
              <i class="fas fa-stop"></i>
            </button>
          </div>
        </div>
        <div class="audio-track-volume-row">
          <i class="fas fa-volume-down volume-icon"></i>
          <input type="range" class="slider-track-volume" min="0" max="1" step="0.05" value="${track.volume}" title="${game.i18n.localize('NARRATIVE_CANVAS.Director.TrackVolume')}" />
          <span class="volume-val-display">${track.volumePercent}%</span>
        </div>
      </div>
    `).join("");
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

    const rawTracks = this.#currentSceneData?.tracks ?? [];
    const activeSceneTracks = rawTracks.map(track => {
      const state = this.#audioController?.getTrackState(track.id) ?? "stopped";
      const vol = this.#audioController?.getTrackVolume(track.id) ?? 1.0;
      return {
        ...track,
        playState: state,
        volume: vol,
        volumePercent: Math.round(vol * 100)
      };
    });

    const gVol = this.#audioController?.globalVolume ?? 0.5;
    const currentFolder = JournalBrowser.getFolders().find(folder => folder.id === this.#currentJournalFolderId);

    return {
      scenes: scenesWithJournalNames,
      filteredScenes: scenesWithJournalNames,
      sceneQuery: this.#sceneQuery,
      filterByJournal: this.#filterByJournal,
      autoActivateFirstSceneOnJournalChange: this.#autoActivateFirstSceneOnJournalChange,
      isCollapsed: this.#isCollapsed,
      isScenesCollapsed: this.#areScenesCollapsed,
      isAudioCollapsed: this.#isAudioCollapsed,
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
      activeSceneTracks,
      globalVolume: gVol,
      masterVolumePercent: Math.round(gVol * 100)
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
    this.#bindCollapseControls(root);
    this.#bindSectionToggles(root);
    this.#bindSceneFilter(root);
    this.#bindSceneSelection(root);
    this.#bindContentLinks(root);
    this.#bindJournalNavigation(root);
    this.#bindJournalControls(root);
    this.#bindTocScrolling(root);
    this.#bindPageSelection(root);
    this.#addImageOverlayButtons(root);
    this.#bindAudioControls(root);
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

  #bindCollapseControls(root) {
    root.querySelector(".sidebar-collapse-toggle")?.addEventListener("click", (event) => {
      event.preventDefault();
      this.toggleCollapse();
    });

  }

  #bindSectionToggles(root) {
    root.querySelectorAll(".sidebar-section-toggle").forEach(button => {
      button.addEventListener("click", () => {
        const section = button.closest(".sidebar-scenes-section, .sidebar-audio-section");
        const content = section?.querySelector(".sidebar-section-content");
        if (!section || !content) return;

        const isCollapsed = !section.classList.contains("is-collapsed");
        const sectionName = button.dataset.sectionToggle;
        section.classList.toggle("is-collapsed", isCollapsed);
        button.setAttribute("aria-expanded", String(!isCollapsed));
        button.title = game.i18n.localize(`NARRATIVE_CANVAS.Director.${isCollapsed ? "Expand" : "Collapse"}${sectionName === "scenes" ? "Scenes" : "Audio"}`);
        button.setAttribute("aria-label", button.title);
        const icon = button.querySelector("i");
        if (icon) icon.className = `fas ${isCollapsed ? "fa-chevron-right" : "fa-chevron-down"}`;

        if (sectionName === "scenes") this.#areScenesCollapsed = isCollapsed;
        if (sectionName === "audio") this.#isAudioCollapsed = isCollapsed;
      });
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
    const canvas = document.getElementById("narrative-canvas-director")
      ?? document.getElementById("narrative-player-display");
    const canvasZIndex = Number.parseInt(canvas ? getComputedStyle(canvas).zIndex : "10000", 10) || 10000;
    windowElement.style.setProperty("z-index", String(canvasZIndex + 1), "important");
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

  #bindAudioControls(root) {
    const audioSection = root.querySelector(".sidebar-audio-section");
    if (!audioSection) return;

    // Track play/pause and stop clicks
    audioSection.addEventListener("click", async (event) => {
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
        await this.#audioController?.playOrPause(track);
        this.updateAudioTrackItem(trackId);
        return;
      }

      if (stopBtn) {
        event.preventDefault();
        await this.#audioController?.stop(trackId);
        this.updateAudioTrackItem(trackId);
        return;
      }
    });

    // Individual Track Volume Slider
    audioSection.addEventListener("input", (event) => {
      const slider = event.target.closest(".slider-track-volume");
      if (!slider) return;

      const item = slider.closest(".director-audio-track-item");
      const trackId = item?.dataset.trackId;
      if (!trackId) return;

      const val = parseFloat(slider.value);
      this.#audioController?.setTrackVolume(trackId, val);

      const valDisplay = item.querySelector(".volume-val-display");
      if (valDisplay) {
        valDisplay.textContent = `${Math.round(val * 100)}%`;
      }
    });

    // Master / Global Volume Slider
    const masterSlider = audioSection.querySelector(".slider-master-volume");
    masterSlider?.addEventListener("input", (event) => {
      const val = parseFloat(event.target.value);
      if (this.#audioController) {
        this.#audioController.globalVolume = val;
      }
      this.#callbacks.onVolumeChange?.(val);

      const percentSpan = audioSection.querySelector(".master-volume-percent");
      if (percentSpan) {
        percentSpan.textContent = `${Math.round(val * 100)}%`;
      }
    });
  }

  /**
   * Updates the UI state of a single track row without a full re-render.
   * @param {string} trackId
   */
  updateAudioTrackItem(trackId) {
    if (!this.#element) return;
    const item = this.#element.querySelector(`.director-audio-track-item[data-track-id="${trackId}"]`);
    if (!item) return;

    const state = this.#audioController?.getTrackState(trackId) ?? "stopped";
    item.classList.toggle("is-playing", state === "playing");
    item.classList.toggle("is-paused", state === "paused");

    const toggleBtn = item.querySelector(".btn-track-toggle");
    if (toggleBtn) {
      if (state === "playing") {
        toggleBtn.innerHTML = `<i class="fas fa-pause"></i>`;
        toggleBtn.title = game.i18n.localize("NARRATIVE_CANVAS.Director.Pause");
      } else {
        toggleBtn.innerHTML = `<i class="fas fa-play"></i>`;
        toggleBtn.title = game.i18n.localize("NARRATIVE_CANVAS.Director.Play");
      }
    }
  }
}

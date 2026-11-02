import { JournalBrowser } from "../services/journal-browser.js";
import { NarrativeSceneRepository } from "../services/scene-repository.js";

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
  #isCollapsed = false;
  #selectedFolderId = "";
  #journalQuery = "";
  #selectedJournalId = "";
  #selectedPageId = "";
  #activeSceneId = "";
  #scenesList = [];
  #currentSceneData = null;

  /**
   * @param {object} options
   * @param {SceneAudioController} options.audioController
   * @param {(sceneId: string) => void} options.onSceneSelect
   * @param {(volume: number) => void} [options.onVolumeChange]
   * @param {(image: {src: string, title: string}) => void} [options.onJournalImageShow]
   */
  constructor({ audioController, onSceneSelect, onVolumeChange, onJournalImageShow }) {
    this.#audioController = audioController;
    this.#callbacks = { onSceneSelect, onVolumeChange, onJournalImageShow };
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

    const headerCollapseBtn = this.#element.querySelector(".btn-sidebar-collapse");
    if (headerCollapseBtn) {
      headerCollapseBtn.title = this.#isCollapsed
        ? game.i18n.localize("NARRATIVE_CANVAS.Director.ExpandSidebar")
        : game.i18n.localize("NARRATIVE_CANVAS.Director.CollapseSidebar");
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

    const folders = JournalBrowser.getFolders();
    const availableJournals = JournalBrowser.getJournals({
      folderId: this.#selectedFolderId || null,
      query: this.#journalQuery
    });

    const activeJournal = this.#selectedJournalId
      ? await JournalBrowser.getJournalDetails(this.#selectedJournalId)
      : null;

    let activePage = null;
    if (activeJournal?.pages.length) {
      activePage = activeJournal.pages.find(page => page.id === this.#selectedPageId) ?? activeJournal.pages[0];
      if (activePage) this.#selectedPageId = activePage.id;
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

    return {
      scenes: scenesWithJournalNames,
      filteredScenes: scenesWithJournalNames,
      sceneQuery: this.#sceneQuery,
      filterByJournal: this.#filterByJournal,
      isCollapsed: this.#isCollapsed,
      activeSceneId: this.#activeSceneId,
      folders,
      selectedFolderId: this.#selectedFolderId,
      journalQuery: this.#journalQuery,
      availableJournals,
      selectedJournalId: this.#selectedJournalId,
      activeJournal,
      selectedPageId: this.#selectedPageId,
      activePage,
      activeSceneTracks,
      globalVolume: gVol,
      masterVolumePercent: Math.round(gVol * 100)
    };
  }

  #bindListeners(root) {
    this.#bindCollapseControls(root);
    this.#bindSceneFilter(root);
    this.#bindSceneSelection(root);
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

    root.querySelector(".btn-sidebar-collapse")?.addEventListener("click", (event) => {
      event.preventDefault();
      this.toggleCollapse();
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

      this.#callbacks.onSceneSelect?.(sceneId);
    });
  }

  #bindJournalControls(root) {
    const folderSelect = root.querySelector(".select-journal-folder");
    const journalFilterInput = root.querySelector(".input-journal-filter");
    const journalSelect = root.querySelector(".select-journal-entry");

    const refreshJournalSelect = () => {
      const journals = JournalBrowser.getJournals({
        folderId: this.#selectedFolderId || null,
        query: this.#journalQuery
      });

      if (!journalSelect) return;
      journalSelect.innerHTML = "";

      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = game.i18n.localize("NARRATIVE_CANVAS.Director.SelectJournal");
      journalSelect.appendChild(defaultOption);

      journals.forEach(journal => {
        const option = document.createElement("option");
        option.value = journal.id;
        option.textContent = journal.name;
        if (journal.id === this.#selectedJournalId) option.selected = true;
        journalSelect.appendChild(option);
      });

      if (this.#selectedJournalId && !journals.some(j => j.id === this.#selectedJournalId)) {
        this.#selectedJournalId = "";
        this.#selectedPageId = "";
        this.#refreshJournalBody();
        this.#applySceneFilters();
      }
    };

    folderSelect?.addEventListener("change", (event) => {
      this.#selectedFolderId = event.target.value;
      refreshJournalSelect();
    });

    journalFilterInput?.addEventListener("input", (event) => {
      this.#journalQuery = event.target.value;
      refreshJournalSelect();
    });

    journalSelect?.addEventListener("change", (event) => {
      this.#selectedJournalId = event.target.value;
      this.#selectedPageId = "";
      this.#refreshJournalBody();
      this.#applySceneFilters();
    });
  }

  async #refreshJournalBody() {
    if (!this.#element) return;
    const bodyContainer = this.#element.querySelector(".journal-viewer-body");
    if (!bodyContainer) return;

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
      const stopAllButton = event.target.closest(".btn-stop-all-audio");
      if (stopAllButton) {
        event.preventDefault();
        await this.#audioController?.stopAll();
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

import { JournalBrowser } from "../services/journal-browser.js";
import { NarrativeSceneRepository } from "../services/scene-repository.js";

/**
 * Controller for the Director Left Sidebar, managing filterable scenes
 * and a filterable journal viewer with a draggable/scrollable badge TOC.
 */
export class DirectorSidebar {
  #callbacks;
  #element = null;
  #sceneQuery = "";
  #selectedFolderId = "";
  #journalQuery = "";
  #selectedJournalId = "";
  #selectedPageId = "";
  #activeSceneId = "";
  #scenesList = [];

  /**
   * @param {object} callbacks
   * @param {(sceneId: string) => void} callbacks.onSceneSelect
   */
  constructor({ onSceneSelect }) {
    this.#callbacks = { onSceneSelect };
  }

  /**
   * Builds the sidebar HTML and registers its event handlers.
   * @param {object} context
   * @returns {Promise<HTMLElement>}
   */
  async render(context = {}) {
    this.#activeSceneId = context.activeSceneId ?? this.#activeSceneId;
    this.#scenesList = context.scenesList ?? NarrativeSceneRepository.getAll();

    const templateData = await this.#prepareTemplateData();
    const htmlString = await renderTemplate("modules/narrative-canvas/templates/partials/director-sidebar.hbs", templateData);

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const newElement = doc.body.firstElementChild;

    this.#element = newElement;
    this.#bindListeners(this.#element);

    return newElement;
  }

  async #prepareTemplateData() {
    const normalizedSceneQuery = this.#sceneQuery.trim().toLowerCase();
    const filteredScenes = this.#scenesList.filter(scene => {
      if (!normalizedSceneQuery) return true;
      const nameMatch = scene.name?.toLowerCase().includes(normalizedSceneQuery);
      const journalMatch = scene.journalName?.toLowerCase().includes(normalizedSceneQuery);
      return nameMatch || journalMatch;
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

    return {
      sceneQuery: this.#sceneQuery,
      activeSceneId: this.#activeSceneId,
      filteredScenes,
      folders,
      selectedFolderId: this.#selectedFolderId,
      journalQuery: this.#journalQuery,
      availableJournals,
      selectedJournalId: this.#selectedJournalId,
      activeJournal,
      selectedPageId: this.#selectedPageId,
      activePage
    };
  }

  #bindListeners(root) {
    this.#bindSceneFilter(root);
    this.#bindSceneSelection(root);
    this.#bindJournalControls(root);
    this.#bindTocScrolling(root);
    this.#bindPageSelection(root);
  }

  #bindSceneFilter(root) {
    const input = root.querySelector(".input-scenes-filter");
    input?.addEventListener("input", (event) => {
      const query = event.target.value.trim().toLowerCase();
      this.#sceneQuery = query;

      const items = root.querySelectorAll(".director-scene-item");
      let visibleCount = 0;
      items.forEach(item => {
        const name = item.querySelector(".scene-item-name")?.textContent.toLowerCase() ?? "";
        const journal = item.querySelector(".scene-item-journal")?.textContent.toLowerCase() ?? "";
        const matches = !query || name.includes(query) || journal.includes(query);
        item.style.display = matches ? "" : "none";
        if (matches) visibleCount++;
      });

      let hint = root.querySelector(".sidebar-scenes-section .sidebar-empty-hint");
      if (!hint && visibleCount === 0) {
        hint = document.createElement("div");
        hint.className = "sidebar-empty-hint";
        hint.textContent = game.i18n.localize("NARRATIVE_CANVAS.Director.NoScenes");
        root.querySelector(".director-scenes-list")?.appendChild(hint);
      } else if (hint) {
        hint.style.display = visibleCount === 0 ? "" : "none";
      }
    });
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
      contentContainer.scrollTop = 0;
    }
  }
}

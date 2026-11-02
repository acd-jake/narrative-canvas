/**
 * Service for querying Journal folders, entries, and page contents.
 */
export class JournalBrowser {
  /**
   * Retrieves all journal folders with their hierarchical path for display in dropdowns.
    * @returns {{id: string, name: string, path: string, parentId: string|null}[]}
   */
  static getFolders() {
    const folders = game.folders ?? game.collections.get("Folder");
    if (!folders) return [];

    const journalFolders = folders.filter(folder => folder.type === "JournalEntry");

    const buildPath = (folder) => {
      const parts = [folder.name];
      let current = folder;
      while (current.folder) {
        const parent = typeof current.folder === "string" ? folders.get(current.folder) : current.folder;
        if (!parent || parent.type !== "JournalEntry") break;
        parts.unshift(parent.name);
        current = parent;
      }
      return parts.join(" / ");
    };

    return journalFolders
      .map(folder => ({
        id: folder.id,
        name: folder.name,
        path: buildPath(folder),
        parentId: typeof folder.folder === "string" ? folder.folder : folder.folder?.id ?? null
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Retrieves only the journals and child folders directly inside one folder level.
   * @param {string|null} folderId
   * @param {string} query
   * @returns {{folders: {id: string, name: string, path: string, parentId: string|null}[], journals: {id: string, name: string, folderId: string|null}[]}}
   */
  static getLevelContents(folderId = null, query = "") {
    const parentFolderId = folderId || null;
    const normalizedQuery = (query || "").trim().toLowerCase();
    const folderCollection = game.folders ?? game.collections.get("Folder");
    const parentFolder = parentFolderId ? folderCollection?.get(parentFolderId) : null;
    const folderSorting = parentFolder?.sorting ?? parentFolder?._source?.sorting;
    const usesManualSorting = Boolean(parentFolder) && folderSorting !== "a";
    const manualOrder = new Map(
      (parentFolder?.contents ?? []).map((entry, index) => [entry.id, index])
    );
    const compareJournals = usesManualSorting
      ? (a, b) => {
        const bySort = (Number(a.sort) || 0) - (Number(b.sort) || 0);
        if (bySort !== 0) return bySort;

        const aIndex = manualOrder.get(a.id);
        const bIndex = manualOrder.get(b.id);
        if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
        return 0;
      }
      : (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        || a.id.localeCompare(b.id);
    const folders = this.getFolders().filter(folder => {
      return folder.parentId === parentFolderId
        && (!normalizedQuery || folder.name.toLowerCase().includes(normalizedQuery));
    });
    const usesManualFolderSorting = !parentFolderId || folderSorting !== "a";
    if (usesManualFolderSorting) {
      folders.sort((a, b) => {
        const aSort = Number(folderCollection?.get(a.id)?.sort) || 0;
        const bSort = Number(folderCollection?.get(b.id)?.sort) || 0;
        return aSort - bSort
          || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          || a.id.localeCompare(b.id);
      });
    }
    const journalCollection = game.journal ?? game.collections.get("JournalEntry");
    const journals = journalCollection
      ? journalCollection
        .filter(entry => {
          const entryFolderId = typeof entry.folder === "string" ? entry.folder : entry.folder?.id ?? null;
          return entryFolderId === parentFolderId
            && (!normalizedQuery || entry.name.toLowerCase().includes(normalizedQuery));
        })
          .sort(compareJournals)
        .map(entry => ({
          id: entry.id,
          name: entry.name,
          folderId: typeof entry.folder === "string" ? entry.folder : entry.folder?.id ?? null
        }))
      : [];

    return { folders, journals };
  }

  static getParentFolderId(folderId) {
    return this.getFolders().find(folder => folder.id === folderId)?.parentId ?? null;
  }

  /**
   * Resolves the set of folder IDs containing the given folder and all its descendants.
   * @param {string} folderId
   * @returns {Set<string>}
   */
  static getFolderSubtreeIds(folderId) {
    if (!folderId) return new Set();
    const folders = game.folders ?? game.collections.get("Folder");
    if (!folders) return new Set([folderId]);

    const subtree = new Set([folderId]);
    let added = true;
    while (added) {
      added = false;
      for (const folder of folders) {
        if (folder.type !== "JournalEntry") continue;
        const parentId = typeof folder.folder === "string" ? folder.folder : folder.folder?.id;
        if (parentId && subtree.has(parentId) && !subtree.has(folder.id)) {
          subtree.add(folder.id);
          added = true;
        }
      }
    }
    return subtree;
  }

  /**
   * Retrieves journal entries matching an optional base folder and search text.
   * @param {object} [options]
   * @param {string|null} [options.folderId]
   * @param {string} [options.query]
   * @returns {{id: string, name: string, folderId: string|null}[]}
   */
  static getJournals({ folderId = null, query = "" } = {}) {
    const journalCollection = game.journal ?? game.collections.get("JournalEntry");
    if (!journalCollection) return [];

    const subtree = folderId ? this.getFolderSubtreeIds(folderId) : null;
    const normalizedQuery = (query || "").trim().toLowerCase();

    return journalCollection
      .filter(entry => {
        const entryFolderId = typeof entry.folder === "string" ? entry.folder : entry.folder?.id;
        if (subtree && (!entryFolderId || !subtree.has(entryFolderId))) return false;
        if (normalizedQuery && !entry.name.toLowerCase().includes(normalizedQuery)) return false;
        return true;
      })
      .map(entry => ({
        id: entry.id,
        name: entry.name,
        folderId: typeof entry.folder === "string" ? entry.folder : entry.folder?.id ?? null
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Loads a journal entry and enriches its pages' HTML content.
   * @param {string} journalId
  * @returns {Promise<{id: string, name: string, uuid: string, folderId: string|null, pages: {id: string, name: string, type: string, content: string}[]}|null>}
   */
  static async getJournalDetails(journalId) {
    if (!journalId) return null;
    const journalCollection = game.journal ?? game.collections.get("JournalEntry");
    let entry = journalCollection?.get(journalId);
    if (!entry && journalId.includes(".")) {
      try {
        entry = await foundry.utils.fromUuid(journalId);
      } catch {
        return null;
      }
    }

    if (entry?.documentName === "JournalEntryPage") entry = entry.parent;
    if (entry?.documentName !== "JournalEntry") return null;

    const rawPages = entry.pages?.contents ?? Array.from(entry.pages ?? []);
    const pages = await Promise.all(rawPages.map(async (page) => {
      let content = "";
      if (page.type === "text") {
        const raw = page.text?.content || page.text?.markdown || "";
        content = await TextEditor.enrichHTML(raw, {
          relativeTo: page,
          secrets: game.user.isGM,
          documents: true,
          links: true,
          rolls: true,
          embeds: true,
          async: true
        });
      } else if (page.type === "image") {
        const src = page.src || page.image?.src;
        const caption = page.image?.caption
          ? await TextEditor.enrichHTML(page.image.caption, {
              relativeTo: page,
              secrets: game.user.isGM,
              documents: true,
              links: true,
              rolls: true,
              async: true
            })
          : "";
        content = src ? `<div class="journal-image-wrapper"><img src="${src}" alt="${page.name || ""}" />${caption ? `<figcaption>${caption}</figcaption>` : ""}</div>` : "";
      } else if (page.type === "video") {
        const src = page.src || page.video?.src;
        content = src ? `<div class="journal-video-wrapper"><video src="${src}" controls></video></div>` : "";
      } else if (page.type === "pdf") {
        content = page.src ? `<iframe src="${page.src}" class="journal-pdf-frame"></iframe>` : "";
      } else if (page.text?.content) {
        content = await TextEditor.enrichHTML(page.text.content, {
          relativeTo: page,
          secrets: game.user.isGM,
          documents: true,
          links: true,
          rolls: true,
          embeds: true,
          async: true
        });
      }

      return {
        id: page.id,
        name: page.name || "Untitled Page",
        type: page.type,
        content
      };
    }));

    if (!pages.length && (entry.content || entry.text?.content)) {
      const raw = entry.content || entry.text?.content || "";
      const enriched = await TextEditor.enrichHTML(raw, {
        relativeTo: entry,
        secrets: game.user.isGM,
        documents: true,
        links: true,
        rolls: true,
        embeds: true,
        async: true
      });
      pages.push({
        id: entry.id,
        name: entry.name,
        type: "text",
        content: enriched
      });
    }

    return {
      id: entry.id,
      name: entry.name,
      uuid: entry.uuid,
      folderId: typeof entry.folder === "string" ? entry.folder : entry.folder?.id ?? null,
      pages
    };
  }
}

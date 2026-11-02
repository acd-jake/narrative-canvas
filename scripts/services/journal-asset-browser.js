import { JournalBrowser } from "./journal-browser.js";

/** Reads draggable actor and image assets referenced by a journal's pages. */
export class JournalAssetBrowser {
  static async getForJournal(journalId) {
    const journal = await JournalBrowser.getJournalDetails(journalId);
    if (!journal) return { actors: [], images: [] };

    const actorUuids = new Set();
    const images = new Map();

    for (const page of journal.pages) {
      const document = new DOMParser().parseFromString(page.content, "text/html");

      document.querySelectorAll('[data-uuid], [data-type="Actor"][data-id]').forEach((link) => {
        const uuid = link.dataset.uuid || `Actor.${link.dataset.id}`;
        if (uuid) actorUuids.add(uuid);
      });

      document.querySelectorAll("img[src]").forEach((image) => {
        const path = image.getAttribute("src")?.trim();
        if (!path || images.has(path)) return;
        images.set(path, {
          name: image.getAttribute("alt") || image.getAttribute("title") || path.split("/").pop() || "Image",
          path
        });
      });
    }

    const actors = await Promise.all([...actorUuids].map(async (uuid) => {
      try {
        const actor = await foundry.utils.fromUuid(uuid);
        if (actor?.documentName !== "Actor") return null;
        return { id: actor.id, name: actor.name, img: actor.img, uuid: actor.uuid };
      } catch (error) {
        console.warn("Narrative Canvas | Failed to resolve journal actor:", uuid, error);
        return null;
      }
    }));

    return { actors: actors.filter(Boolean), images: [...images.values()] };
  }
}
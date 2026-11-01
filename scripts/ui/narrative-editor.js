import { NarrativeSettings } from "../services/settings.js";
import { NarrativeSceneRepository } from "../services/scene-repository.js";
import { JournalDockController } from "../services/journal-dock.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Dropzone type that accepts any supported asset and creates a scene for it. */
const ANY_ASSET_TYPE = "*";

/**
 * Window for building narrative scenes. It renders scene data and forwards user actions;
 * persistence lives in NarrativeSceneRepository, journal docking in JournalDockController.
 */
export class NarrativeSceneEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Scene that was selected before docking; reselected when the dock is released. */
  #freeSceneId = null;
  #dock;

  constructor(options = {}) {
    super(options);
    
    this.selectedSceneId = null;
    this.#dock = new JournalDockController(this, {
      onDocked: ({ journalId, previousJournalId }) => {
        if (!previousJournalId) this.#freeSceneId = this.selectedSceneId;
        if (journalId !== previousJournalId) this.selectedSceneId = null;
      },
      onReleased: () => {
        this.selectedSceneId = this.#freeSceneId;
        this.#freeSceneId = null;
      }
    });
    
    this.#dock.register();
  }

  static DEFAULT_OPTIONS = {
    id: "narrative-scene-editor",
    tag: "div",
    classes: ["acd-nc-editor-window"],
    window: { frame: true, title: "NARRATIVE_CANVAS.Editor.WindowTitle", minimizable: true, resizable: true },
    position: { width: 750, height: 460 }
  };

  static PARTS = {
    main: { template: "modules/narrative-canvas/templates/scene-editor.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const scenes = NarrativeSceneRepository.getVisible(this.#dock.journalId)
      .map(scene => scene.journalId
        ? { ...scene, journalName: this.#journalNameOf(scene.journalId) ?? scene.journalName }
        : scene);

    if (!scenes.some(scene => scene.id === this.selectedSceneId)) {
      this.selectedSceneId = scenes[0]?.id ?? null;
    }

    return {
      allScenes: scenes,
      selectedSceneId: this.selectedSceneId,
      activeScene: scenes.find(scene => scene.id === this.selectedSceneId) ?? null,
      tileSize: NarrativeSettings.getTileSize()
    };
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.#dock.dockToActiveJournal();
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    this.#dock.release();
  }
  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    
    if (this.element) {
      this._dragDrop = this._dragDrop || this.#createDragDrop();
      this._dragDrop.bind(this.element);
      this.#bindListeners();
    }
  }

  #createDragDrop() {
    return new DragDrop({
      dropSelector: ".editor-dropzone",
      permissions: { drop: () => game.user.isGM },
      callbacks: {
        dragover: (event) => event.currentTarget.classList.add("drag-over"),
        dragleave: (event) => event.currentTarget.classList.remove("drag-over"),
        drop: (event) => this.#onAssetDrop(event)
      }
    });
  }

  #bindListeners() {
    const html = this.element;
    this.#bindSceneList(html);
    this.#bindSceneHeader(html);
    this.#bindBackgroundPicker(html);
    this.#bindTileDeletion(html);
    this.#bindTileSizeSlider(html);
  }

  #bindSceneList(html) {
    html.querySelectorAll(".scene-navigation-item").forEach(item => {
      item.addEventListener("click", (event) => {
        if (event.target.closest(".btn-delete-scene")) return;
        this.selectedSceneId = item.dataset.sceneId;
        this.render();
      });
    });

    html.querySelector(".btn-create-scene")?.addEventListener("click", async () => {
      const scene = await NarrativeSceneRepository.create({
        name: game.i18n.localize("NARRATIVE_CANVAS.Editor.NewSceneDefault"),
        journalId: this.#dock.journalId
      });
      this.selectedSceneId = scene.id;
      await this.#refreshViews();
    });

    html.querySelectorAll(".btn-delete-scene").forEach(button => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const sceneId = button.closest(".scene-navigation-item").dataset.sceneId;
        if (this.selectedSceneId === sceneId) this.selectedSceneId = null;
        await this.#persistAndRefresh(NarrativeSceneRepository.remove(sceneId));
      });
    });
  }

  #bindSceneHeader(html) {
    html.querySelector(".input-scene-rename-field")?.addEventListener("change", (event) => {
      const name = event.target.value || game.i18n.localize("NARRATIVE_CANVAS.Editor.NewSceneDefault");
      this.#persistAndRefresh(NarrativeSceneRepository.rename(event.target.dataset.sceneId, name));
    });
  }

  #bindBackgroundPicker(html) {
    html.querySelector(".btn-editor-add-bg")?.addEventListener("click", (event) => {
      const sceneId = event.currentTarget.dataset.sceneId;
      new FilePicker({
        type: "image",
        classes: ["filepicker", "acd-nc-elevation"],
        callback: (path) => this.#persistAndRefresh(NarrativeSceneRepository.addBackground(sceneId, path))
      }).browse();
    });
  }

  #bindTileDeletion(html) {
    html.querySelectorAll(".btn-delete-item").forEach(button => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const { type, index, id } = button.closest(".tile-thumbnail-card").dataset;
        const sceneId = this.selectedSceneId;

        const removals = {
          background: () => NarrativeSceneRepository.removeBackground(sceneId, parseInt(index)),
          Actor: () => NarrativeSceneRepository.removeActor(sceneId, id),
          PlaylistSound: () => NarrativeSceneRepository.removeTrack(sceneId, id)
        };
        if (sceneId && removals[type]) this.#persistAndRefresh(removals[type]());
      });
    });
  }

  #bindTileSizeSlider(html) {
    html.querySelector(".slider-tile-scale")?.addEventListener("input", (event) => {
      const size = parseInt(event.target.value);

      // Apply visually first; persisting is async and must not delay the update.
      html.querySelector(".narrative-editor-window")?.style.setProperty("--nc-tile-size", `${size}px`);
      NarrativeSettings.setTileSize(size);
    });
  }
  
  async #onAssetDrop(event) {
    const dropzone = event.currentTarget;
    dropzone.classList.remove("drag-over");
    const { type: dropzoneType, sceneId } = dropzone.dataset;
    
    try {
      const asset = this.#toSceneAsset(JSON.parse(event.dataTransfer.getData("text/plain")));
      if (!asset || (dropzoneType !== ANY_ASSET_TYPE && asset.type !== dropzoneType)) return;

      const targetSceneId = sceneId || await this.#createSceneFor(asset);
      await this.#persistAndRefresh(asset.addTo(targetSceneId));
    } catch (error) {
      console.error("Narrative Canvas | Drop error:", error);
    }
  }

  /** Translates dropped Foundry data into a scene asset, or null if it is not supported. */
  #toSceneAsset(dropped) {
    if (dropped?.type === "Actor") {
      const actor = game.actors.get(dropped.uuid.split(".").pop());
      if (!actor) return null;
      return {
        type: "Actor",
        name: actor.name,
        addTo: (sceneId) => NarrativeSceneRepository.addActor(sceneId, { id: actor.id, name: actor.name, img: actor.img })
      };
    }

    if (dropped?.type === "PlaylistSound") {
      const track = { id: dropped.soundId || foundry.utils.randomID(), name: dropped.name, path: dropped.path || "" };
      return {
        type: "PlaylistSound",
        name: track.name,
        addTo: (sceneId) => NarrativeSceneRepository.addTrack(sceneId, track)
      };
    }

    return null;
  }

  /** Creates and selects a scene named after the docked journal, or after the dropped asset. */
  async #createSceneFor(asset) {
    const journalId = this.#dock.journalId;
    const scene = await NarrativeSceneRepository.create({
      name: this.#journalNameOf(journalId) || asset.name,
      journalId
    });
    this.selectedSceneId = scene.id;
    return scene.id;
  }

  #journalNameOf(journalId) {
    return journalId ? game.collections.get("JournalEntry").get(journalId)?.name : undefined;
  }

  /** Waits for a repository change, then refreshes every view that shows scene data. */
  async #persistAndRefresh(change) {
    await change;
    await this.#refreshViews();
  }

  async #refreshViews() {
    await this.render();
    await game.modules.get("narrative-canvas").manager?.refreshView();
  }
}

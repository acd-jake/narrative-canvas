import { NarrativeSettings } from "../services/settings.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Advanced scene builder interface featuring scene management list, 
 * FilePicker background addition, and Drag & Drop compendium rules.
 */
export class NarrativeSceneEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    
    this.activeJournalId = null;
    this.selectedSceneId = null; // Currently clicked scene item track link
    this._savedPosition = null;
    
    this._setupJournalTrackingHooks();
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
    const scenes = NarrativeSettings.getAllScenes();
    
    if (!this.selectedSceneId && scenes.length > 0) {
      this.selectedSceneId = scenes[0].id;
    }

    const activeScene = scenes.find(s => s.id === this.selectedSceneId) || null;

    return {
      allScenes: scenes,
      selectedSceneId: this.selectedSceneId,
      activeScene: activeScene,
      // Pass the persistent tile size out to the compiler context
      tileSize: NarrativeSettings.getTileSize()
    };
  }
  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    
    if (this.element) {
      this._dragDrop = this._dragDrop || this._initializeDragDropRules();
      this._dragDrop.bind(this.element);
      this._activateLocalListeners();
    }
  }

  _initializeDragDropRules() {
    return new DragDrop({
      dropSelector: ".editor-dropzone",
      permissions: { drop: () => game.user.isGM },
      callbacks: {
        dragover: (e) => e.currentTarget.classList.add("drag-over"),
        dragleave: (e) => e.currentTarget.classList.remove("drag-over"),
        drop: this._onAssetDrop.bind(this)
      }
    });
  }

  /** @override */
  _activateLocalListeners() {
    // ... keep your existing listeners (create-scene, delete-scene, rename-field, filepicker) ...
    const html = this.element;

    // Call your existing click handlers
    this._wireExistingClickHandlers(html);

    // NEW LISTENERS: Dynamic slider tracking with instant database cache commits
    html.querySelector(".slider-tile-scale")?.addEventListener("input", (e) => {
      const newSize = parseInt(e.target.value);

      // Apply immediately; persisting is async and must not delay the visual update.
      html.querySelector(".narrative-editor-window")?.style.setProperty("--nc-tile-size", `${newSize}px`);
      NarrativeSettings.setTileSize(newSize);
    });
  }

  // Abstract helper block to keep code clean and readable
  _wireExistingClickHandlers(html) {
    html.querySelectorAll(".scene-navigation-item").forEach(item => {
      item.addEventListener("click", (e) => {
        if (e.target.closest(".btn-delete-scene")) return;
        this.selectedSceneId = item.dataset.sceneId;
        this.render();
      });
    });

    html.querySelector(".btn-create-scene")?.addEventListener("click", async () => {
      const scenes = NarrativeSettings.getAllScenes();
      const newId = `scene-${foundry.utils.randomID()}`;
      const newScene = { id: newId, name: game.i18n.localize("NARRATIVE_CANVAS.Editor.NewSceneDefault"), backgrounds: [], actors: [], tracks: [] };
      scenes.push(newScene);
      await game.settings.set("narrative-canvas", NarrativeSettings.SETTING_SCENES_DATA, scenes);
      this.selectedSceneId = newId;
      this.render();
      this._notifyManagerRefresh();
    });

    html.querySelectorAll(".btn-delete-scene").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const sceneId = btn.closest(".scene-navigation-item").dataset.sceneId;
        let scenes = NarrativeSettings.getAllScenes();
        scenes = scenes.filter(s => s.id !== sceneId);
        await game.settings.set("narrative-canvas", NarrativeSettings.SETTING_SCENES_DATA, scenes);
        if (this.selectedSceneId === sceneId) this.selectedSceneId = null;
        this.render();
        this._notifyManagerRefresh();
      });
    });

    html.querySelector(".input-scene-rename-field")?.addEventListener("change", async (e) => {
      const sceneId = e.target.dataset.sceneId;
      const scenes = NarrativeSettings.getAllScenes();
      const scene = scenes.find(s => s.id === sceneId);
      if (scene) {
        scene.name = e.target.value || "Unnamed Scene";
        await game.settings.set("narrative-canvas", NarrativeSettings.SETTING_SCENES_DATA, scenes);
        this.render();
        this._notifyManagerRefresh();
      }
    });

    html.querySelector(".btn-editor-add-bg")?.addEventListener("click", (e) => {
      const sceneId = e.currentTarget.dataset.sceneId;
      new FilePicker({
        type: "image",
        classes: ["filepicker", "acd-nc-elevation"],
        callback: async (path) => {
          const scenes = NarrativeSettings.getAllScenes();
          const scene = scenes.find(s => s.id === sceneId);
          if (scene) {
            const fileName = path.split("/").pop();
            scene.backgrounds.push({ name: fileName, path: path });
            await game.settings.set("narrative-canvas", NarrativeSettings.SETTING_SCENES_DATA, scenes);
            this.render();
            this._notifyManagerRefresh();
          }
        }
      }).browse();
    });

    html.querySelectorAll(".btn-delete-item").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const card = btn.closest(".tile-thumbnail-card");
        const type = card.dataset.type;
        const scenes = NarrativeSettings.getAllScenes();
        const scene = scenes.find(s => s.id === this.selectedSceneId);
        if (!scene) return;

        if (type === "background") scene.backgrounds.splice(parseInt(card.dataset.index), 1);
        if (type === "Actor") scene.actors = scene.actors.filter(a => a.id !== card.dataset.id);
        if (type === "PlaylistSound") scene.tracks = scene.tracks.filter(t => t.id !== card.dataset.id);

        await game.settings.set("narrative-canvas", NarrativeSettings.SETTING_SCENES_DATA, scenes);
        this.render();
        this._notifyManagerRefresh();
      });
    });
  }
  
  async _onAssetDrop(event) {
    event.currentTarget.classList.remove("drag-over");
    const dropzone = event.currentTarget;
    const dropzoneType = dropzone.dataset.type;
    const sceneId = dropzone.dataset.sceneId;
    
    try {
      const data = JSON.parse(event.dataTransfer.getData("text/plain"));
      if (!data || !data.type) return;

      const scenes = NarrativeSettings.getAllScenes();
      const scene = scenes.find(s => s.id === sceneId);
      if (!scene) return;

      if (data.type === "Actor" && dropzoneType === "Actor") {
        const actor = game.actors.get(data.uuid.split(".").pop());
        if (actor && !scene.actors.some(a => a.id === actor.id)) {
          scene.actors.push({ id: actor.id, name: actor.name, img: actor.img });
        }
      } else if (data.type === "PlaylistSound" && dropzoneType === "PlaylistSound") {
        scene.tracks.push({ id: data.soundId || foundry.utils.randomID(), name: data.name, path: data.path || "" });
      }

      await game.settings.set("narrative-canvas", NarrativeSettings.SETTING_SCENES_DATA, scenes);
      this.render();
      this._notifyManagerRefresh();

    } catch (err) {
      console.error("Narrative Canvas | Drop error:", err);
    }
  }

  _notifyManagerRefresh() {
    const manager = game.modules.get("narrative-canvas").manager;
    if (manager) manager.refreshView();
  }

  async anchorToJournal(journalId) {
    if (journalId) {
      const targetId = `journal-${journalId}`;
      const scenes = NarrativeSettings.getAllScenes();
      let scene = scenes.find(s => s.id === targetId);
      
      // Auto-create linked journal scene structure if absent
      if (!scene) {
        scene = {
          id: targetId,
          name: game.journals.get(journalId)?.name || "Linked Journal Scene",
          journalId: journalId,
          journalName: game.journals.get(journalId)?.name,
          backgrounds: [],
          actors: [],
          tracks: []
        };
        scenes.push(scene);
        await game.settings.set("narrative-canvas", NarrativeSettings.SETTING_SCENES_DATA, scenes);
      }

      this.selectedSceneId = targetId;
      const journalApp = Object.values(ui.windows).find(app => app.document?.id === journalId);
      const journalHtml = journalApp?.element;

      if (journalHtml) {
        if (!this._savedPosition) this._savedPosition = { ...this.position };
        const jBounds = journalHtml.getBoundingClientRect();
        
        this.setPosition({
          top: jBounds.top,
          left: jBounds.right + 8, 
          height: jBounds.height,
          width: 450 
        });
      }
    } else {
      if (this._savedPosition) {
        this.setPosition(this._savedPosition);
        this._savedPosition = null;
      }
    }
    this.render();
  }

  _setupJournalTrackingHooks() {
    Hooks.on("renderJournalSheet", (app, html, data) => {
      if (!this.rendered) return;
      this.anchorToJournal(app.document.id);
    });

    Hooks.on("closeJournalSheet", (app, html) => {
      if (!this.rendered || !this.selectedSceneId?.startsWith("journal-")) return;
      this.anchorToJournal(null);
    });
  }
}

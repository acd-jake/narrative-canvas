import { NarrativeSocket } from "./socket.js";
import { NarrativeSettings } from "./settings.js";
import { NarrativePlayer } from "../ui/narrative-player.js";
import { NarrativeDirector } from "../ui/narrative-director.js";
import { NarrativeSceneEditor } from "../ui/narrative-editor.js";

export class NarrativeManager {
  constructor() {
    this.narrativeState = {
      active: false,
      playerViewActive: false,
      background: "",
      activeDialogue: null,
      handout: null,

      // NEW STATE MANAGEMENT VARIABLES
      activeSceneId: "",
      currentSceneData: null,
      activeActors: [],        // Holds active character objects rendered on screen
      activeTrackId: null,
      globalVolume: 0.5,
      scenesList: []
    };
    this.view = null;
    this.editorApp = null;
  }

  async refreshView() {
    // Populate scene dropdown array compilation dynamically on refresh step
    this.narrativeState.scenesList = NarrativeSettings.getAllScenes();

    const shouldRender = game.user.isGM ? this.narrativeState.active : this.narrativeState.playerViewActive;
    if (shouldRender) {
      if (!this.view) {
        this.view = game.user.isGM ? new NarrativeDirector(this._getGMCallbacks()) : new NarrativePlayer();
      }
      await this.view.render(this.narrativeState);
    } else {
      if (this.view) { this.view.close(); this.view = null; }
    }
  }

  /**
   * Local toggle action invoked from the Scene Controls button.
   * @param {boolean} active 
   */
  async toggleCanvasState(active) {
    if (game.user.isGM) {
      if (active && this.narrativeState.active) {
        await this.view?.render(this.narrativeState);
        NarrativeSocket.emit("UPDATE_DISPLAY", this.narrativeState);
        return;
      }

      this.narrativeState.active = active;
      if (!active) this.narrativeState.playerViewActive = false;

      await this.refreshView();
      NarrativeSocket.emit("UPDATE_DISPLAY", this.narrativeState);
    } else {
      if (NarrativeSettings.userHasPermission()) {
        this.narrativeState.active = active;
        await this.refreshView();
      }
    }
  }

  /**
   * Direct target synchronization. Sends the full state context payload to a newly logged-in user.
   * @param {string} targetUserId - The ID of the client requesting the state sync
   */
  sendCurrentStateToUser(targetUserId) {
    if (!game.user.isGM) return;
    NarrativeSocket.emit("SYNC_STATE", this.narrativeState, targetUserId);
  }

  /**
   * Mutates and synchronizes incoming data changes, handling both local updates and network events.
   * @param {object} data - Object slice containing state mutations
   * @param {boolean} [isRemote=false] - Flag indicating if the update came from the socket pipeline
   */
  async handleDisplayUpdate(data, isRemote = false) {
    this.narrativeState = { ...this.narrativeState, ...data };
    if (game.user.isGM && !isRemote) { NarrativeSocket.emit("UPDATE_DISPLAY", data); }
    await this.refreshView();
  }

  _getGMCallbacks() {
    return {
      onSceneSelect: (sceneId) => {
        const scenes = NarrativeSettings.getAllScenes();
        const selectedData = scenes.find(s => s.id === sceneId) || null;

        this.handleDisplayUpdate({
          activeSceneId: sceneId,
          currentSceneData: selectedData,
          background: selectedData?.backgrounds[0]?.path || "",
          activeActors: [], // Wipe current character staging lists on scene transitions
          activeTrackId: null
        });
      },
      onActorStageToggle: (actorId) => {
        const actorData = this.narrativeState.currentSceneData?.actors.find(a => a.id === actorId);
        if (!actorData) return;

        let activeList = [...this.narrativeState.activeActors];
        const existingIndex = activeList.findIndex(a => a.id === actorId);

        if (existingIndex > -1) {
          activeList.splice(existingIndex, 1); // Remove character if clicked again
        } else {
          activeList.push(actorData); // Deploy character on Visual Novel Layer
        }

        // Add visibility indicator helper variables back inside the dataset tracking
        this.narrativeState.currentSceneData.actors.forEach(a => {
          a.isActiveOnCanvas = activeList.some(active => active.id === a.id);
        });

        this.handleDisplayUpdate({ activeActors: activeList });
      },
      onBackgroundChange: (path) => this.handleDisplayUpdate({ background: path }),
      onTrackPlay: (trackId) => this.handleDisplayUpdate({ activeTrackId: trackId }),
      onVolumeChange: (volume) => this.handleDisplayUpdate({ globalVolume: volume }),
      onVisibilityChange: (visible) => this.handleDisplayUpdate({ playerViewActive: visible }),
      onShutdown: () => this.toggleCanvasState(false)
    };
  }

  /**
 * Toggles the open/close state of the V14 ApplicationV2 Creator Scene Editor panel.
 */
  toggleEditorWindow() {
    if (!game.user.isGM) return;

    if (this.editorApp && this.editorApp.rendered) {
      this.editorApp.close();
    } else {
      if (!this.editorApp) this.editorApp = new NarrativeSceneEditor();
      this.editorApp.render({ force: true });
    }
  }
}
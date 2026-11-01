import { NarrativeSocket } from "./socket.js";
import { NarrativeSettings } from "./settings.js";
import { NarrativePlayer } from "../ui/narrative-player.js";
import { NarrativeDirector } from "../ui/narrative-director.js";

/**
 * High-level state manager running silently to control data flow and synchronize network clients.
 */
export class NarrativeManager {
  constructor() {
    this.narrativeState = {
      active: false,
      playerViewActive: false,
      background: "",
      activeDialogue: null,
      handout: null
    };
    this.view = null;
  }

  /**
   * Dispatches window render sequences based on local execution context and server rules.
   */
  async refreshView() {
    const shouldRender = game.user.isGM ? this.narrativeState.active : this.narrativeState.playerViewActive;

    if (shouldRender) {
      if (!this.view) {
        this.view = game.user.isGM 
          ? new NarrativeDirector(this._getGMCallbacks()) 
          : new NarrativePlayer();
      }
      await this.view.render(this.narrativeState);
    } else {
      if (this.view) {
        this.view.close();
        this.view = null;
      }
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

    if (game.user.isGM && !isRemote) {
      NarrativeSocket.emit("UPDATE_DISPLAY", data);
    }

    await this.refreshView();
  }

  /**
   * Clean Code Interconnection: Invoked by the bootstrapper when no active GM is detected.
   * Instantly cleans up player screens locally and displays a warning toast.
   */
  forceShutdownDueToGMDisconnect() {
    if (this.narrativeState.playerViewActive) {
      ui.notifications.warn(game.i18n.localize("NARRATIVE_CANVAS.Notifications.GMDisconnected"));
    }

    this.narrativeState.active = false;
    this.narrativeState.playerViewActive = false;
    
    if (this.view) {
      this.view.close();
      this.view = null;
    }
  }

  /**
   * Generates clean callback hooks to feed the director view without exposing core states.
   * @private
   * @returns {object}
   */
  _getGMCallbacks() {
    return {
      onVisibilityChange: (visible) => this.handleDisplayUpdate({ playerViewActive: visible }),
      onBackgroundChange: (path) => this.handleDisplayUpdate({ background: path }),
      onDialogueTrigger: (text) => {
        const update = { activeDialogue: { speaker: "NPC", text: text } };
        this.handleDisplayUpdate(update);
      },
      onClearDisplay: () => {
        const reset = { activeDialogue: null, handout: null };
        this.handleDisplayUpdate(reset);
      },
      onShutdown: () => this.toggleCanvasState(false)
    };
  }
}

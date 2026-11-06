import { NarrativeSocket } from "./socket.js";
import { NarrativeSettings } from "./settings.js";
import { NarrativeControls } from "./controls.js";
import { NarrativeManager } from "./manager.js";
import { NarrativeSettingsLayout } from "./settings-layout.js";

/**
 * Handles the low-level Foundry VTT hook lifecycle and module bootstrapping.
 */
export class NarrativeBootstrapper {
  /**
   * Initializes system hooks and registers configuration wrappers.
   */
  static bootstrap() {
    Hooks.once("init", () => {
      NarrativeSettings.register();
      game.modules.get("narrative-canvas").manager = new NarrativeManager();
    });

    Hooks.once("setup", () => {
      NarrativeSettings.registerJournalRootFolder();
    });

    Hooks.once("ready", () => {
      NarrativeSettings.migrateLayoutSettings();
      const manager = game.modules.get("narrative-canvas").manager;
      if (manager) {
        if (game.user.isGM) {
          manager.restorePersistedState();
        }
        NarrativeSocket.listen(manager);
        
        if (!game.user.isGM) {
          NarrativeSocket.emit("REQUEST_STATE", {});
        }
      }
    });

    Hooks.on("getSceneControlButtons", (controls) => {
      NarrativeControls.initialize(controls);
    });

    Hooks.on("renderSettingsConfig", (app, html) => NarrativeSettingsLayout.apply(html));

    Hooks.on("renderSceneControls", () => {
      const manager = game.modules.get("narrative-canvas").manager;
      NarrativeControls.setCanvasControlEnabled(
        game.user.isGM || Boolean(manager?.narrativeState.playerViewActive)
      );
    });

    Hooks.on("userConnected", (user, connected) => {
      if (connected) return;

      if (user.isGM) {
        const anyActiveGM = game.users.some(u => u.isGM && u.active);
        
        if (!anyActiveGM) {
          const manager = game.modules.get("narrative-canvas").manager;
          if (manager) {
            manager.forceShutdownDueToGMDisconnect();
          }
        }
      }
    });
  }
}

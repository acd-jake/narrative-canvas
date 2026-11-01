import { NarrativeSocket } from "./socket.js";
import { NarrativeSettings } from "./settings.js";
import { NarrativeControls } from "./controls.js";
import { NarrativeManager } from "./manager.js";

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

    Hooks.once("ready", () => {
      const manager = game.modules.get("narrative-canvas").manager;
      if (manager) {
        NarrativeSocket.listen(manager);
        
        if (!game.user.isGM) {
          NarrativeSocket.emit("REQUEST_STATE", {});
        }
      }
    });

    Hooks.on("getSceneControlButtons", (controls) => {
      NarrativeControls.initialize(controls);
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

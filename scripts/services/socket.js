import { NarrativeLogger } from "./logger.js";

/**
 * Manages client-server communication via Foundry's socket API.
 */
export class NarrativeSocket {
  static EVENT_NAME = "module.narrative-canvas";

  /**
   * Registers socket listeners on the client side.
   * @param {NarrativeManager} manager - Reference to the core module manager
   */
  static listen(manager) {
    if (!game.socket) {
      NarrativeLogger.error("Cannot register module socket listener because the Foundry socket is unavailable", {
        eventName: this.EVENT_NAME,
        userId: game.user?.id
      });
      return;
    }

    NarrativeLogger.info("Registering module socket listener", {
      eventName: this.EVENT_NAME,
      userId: game.user.id,
      isGM: game.user.isGM
    });

    game.socket.on(this.EVENT_NAME, (packet) => {
      if (!packet || typeof packet.type !== "string") {
        NarrativeLogger.warn("Ignoring invalid socket packet", {
          packetType: typeof packet,
          packetKeys: packet && typeof packet === "object" ? Object.keys(packet) : []
        });
        return;
      }

      const { type, data, userId } = packet;
      NarrativeLogger.debug("Received socket event", {
        type,
        senderOrTargetId: userId,
        userId: game.user.id
      });
      NarrativeLogger.trace("Socket event payload keys", {
        type,
        keys: data && typeof data === "object" ? Object.keys(data) : []
      });
      
      switch (type) {
        case "UPDATE_DISPLAY":
          manager.handleDisplayUpdate(data, true);
          break;

        case "HANDOUT_IMAGE_LAYOUT":
          manager.handleHandoutImageLayout(data.layout, data.isFinal, true);
          break;
          
        case "REQUEST_STATE":
          // Only the GM should respond to a state request from a newly logged-in user
          if (game.user.isGM) {
            manager.sendCurrentStateToUser(userId);
          }
          break;
          
        case "SYNC_STATE":
          // A player receives the direct sync packet from the GM
          if (game.user.id === userId) {
            NarrativeLogger.info("Applying direct Canvas state sync", { targetUserId: userId });
            manager.handleDisplayUpdate(data, true);
          } else {
            NarrativeLogger.trace("Ignoring Canvas state sync for another user", {
              targetUserId: userId
            });
          }
          break;

        case "REOPEN_PLAYER_CANVAS":
          if (game.users.get(userId)?.isGM) {
            NarrativeLogger.info("Reopening player Canvas after GM request", { gmUserId: userId });
            manager.reopenPlayerCanvas();
          } else {
            NarrativeLogger.warn("Ignoring player Canvas reopen request from a non-GM", {
              senderUserId: userId
            });
          }
          break;

        default:
          NarrativeLogger.debug("Ignoring unhandled socket event", { type, senderOrTargetId: userId });
      }
    });
  }

  /**
   * Broadcasts an event from the GM to all connected clients or requests data.
   * @param {string} type - The event identifier
   * @param {object} data - The payload data
   * @param {string} [targetUserId] - Optional specific user ID for direct responses
   */
  static emit(type, data, targetUserId = null) {
    if (!game.socket) {
      NarrativeLogger.error("Cannot emit socket event because the Foundry socket is unavailable", { type });
      return;
    }

    NarrativeLogger.debug("Emitting socket event", {
      type,
      senderUserId: game.user.id,
      targetUserId,
      payloadKeys: data && typeof data === "object" ? Object.keys(data) : []
    });
    game.socket.emit(this.EVENT_NAME, {
      type,
      data,
      userId: targetUserId || game.user.id
    });
  }
}

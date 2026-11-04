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

    game.socket.on(this.EVENT_NAME, (packet, senderId) => {
      if (!packet || typeof packet.type !== "string" || typeof senderId !== "string") {
        NarrativeLogger.warn("Ignoring invalid socket packet", {
          packetType: typeof packet,
          packetKeys: packet && typeof packet === "object" ? Object.keys(packet) : []
        });
        return;
      }

      const { type, data, userId } = packet;
      const sender = game.users.get(senderId);
      if (!sender) {
        NarrativeLogger.warn("Ignoring socket packet from an unknown user", { senderId, type });
        return;
      }

      NarrativeLogger.debug("Received socket event", {
        type,
        senderOrTargetId: senderId,
        userId: game.user.id
      });
      NarrativeLogger.trace("Socket event payload keys", {
        type,
        keys: data && typeof data === "object" ? Object.keys(data) : []
      });
      
      switch (type) {
        case "UPDATE_DISPLAY":
          if (!sender.isGM || !data || typeof data !== "object" || Array.isArray(data)) {
            NarrativeLogger.warn("Ignoring invalid display update", { senderId, isGM: sender.isGM });
            return;
          }
          manager.handleDisplayUpdate(data, true);
          break;

        case "HANDOUT_IMAGE_LAYOUT":
          if (!sender.isGM || !data || typeof data !== "object" || !Array.isArray(data.layout)) {
            NarrativeLogger.warn("Ignoring invalid handout image layout", { senderId, isGM: sender.isGM });
            return;
          }
          manager.handleHandoutImageLayout(data.layout, data.isFinal, true);
          break;
          
        case "REQUEST_STATE":
          if (game.user.isGM && !sender.isGM) {
            manager.sendCurrentStateToUser(senderId);
          }
          break;
          
        case "SYNC_STATE":
          if (sender.isGM && game.user.id === userId && data && typeof data === "object" && !Array.isArray(data)) {
            NarrativeLogger.info("Applying direct Canvas state sync", { targetUserId: userId });
            manager.handleDisplayUpdate(data, true);
          } else {
            NarrativeLogger.warn("Ignoring unauthorized Canvas state sync", {
              senderId,
              targetUserId: userId
            });
          }
          break;

        case "REOPEN_PLAYER_CANVAS":
          if (sender.isGM) {
            NarrativeLogger.info("Reopening player Canvas after GM request", { gmUserId: senderId });
            manager.reopenPlayerCanvas();
          } else {
            NarrativeLogger.warn("Ignoring player Canvas reopen request from a non-GM", {
              senderUserId: senderId
            });
          }
          break;

        default:
          NarrativeLogger.debug("Ignoring unhandled socket event", { type, senderOrTargetId: senderId });
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

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
    game.socket.on(this.EVENT_NAME, (packet) => {
      const { type, data, userId } = packet;
      
      switch (type) {
        case "UPDATE_DISPLAY":
          manager.handleDisplayUpdate(data, true);
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
            manager.handleDisplayUpdate(data, true);
          }
          break;
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
    game.socket.emit(this.EVENT_NAME, {
      type,
      data,
      userId: targetUserId || game.user.id
    });
  }
}

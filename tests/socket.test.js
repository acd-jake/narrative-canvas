import { afterEach, describe, expect, it, vi } from "vitest";
import { NarrativeSocket } from "../scripts/services/socket.js";

describe("NarrativeSocket authorization", () => {
  let receive;
  let manager;

  const setup = localUser => {
    manager = {
      handleDisplayUpdate: vi.fn(),
      handleHandoutImageLayout: vi.fn(),
      sendCurrentStateToUser: vi.fn(),
      reopenPlayerCanvas: vi.fn()
    };
    const users = new Map([
      ["gm-1", { id: "gm-1", isGM: true }],
      ["player-1", { id: "player-1", isGM: false }],
      ["player-2", { id: "player-2", isGM: false }]
    ]);
    vi.stubGlobal("game", {
      user: localUser,
      users,
      settings: { get: () => "off" },
      socket: {
        on: vi.fn((_eventName, listener) => { receive = listener; }),
        emit: vi.fn()
      }
    });

    NarrativeSocket.listen(manager);
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts display updates only from the authenticated GM", () => {
    setup({ id: "player-1", isGM: false });
    const data = { active: true };

    receive({ type: "UPDATE_DISPLAY", data, userId: "gm-1" }, "player-1");
    expect(manager.handleDisplayUpdate).not.toHaveBeenCalled();

    receive({ type: "UPDATE_DISPLAY", data, userId: "player-1" }, "gm-1");
    expect(manager.handleDisplayUpdate).toHaveBeenCalledWith(data, true);
  });

  it("sends state only to the authenticated requester", () => {
    setup({ id: "gm-1", isGM: true });

    receive({ type: "REQUEST_STATE", userId: "player-2" }, "player-1");

    expect(manager.sendCurrentStateToUser).toHaveBeenCalledWith("player-1");
  });

  it("accepts targeted state sync and reopen only from the authenticated GM", () => {
    setup({ id: "player-1", isGM: false });
    const data = { playerViewActive: true };

    receive({ type: "SYNC_STATE", data, userId: "player-1" }, "player-1");
    receive({ type: "SYNC_STATE", data, userId: "player-2" }, "gm-1");
    expect(manager.handleDisplayUpdate).not.toHaveBeenCalled();

    receive({ type: "SYNC_STATE", data, userId: "player-1" }, "gm-1");
    expect(manager.handleDisplayUpdate).toHaveBeenCalledWith(data, true);

    receive({ type: "REOPEN_PLAYER_CANVAS", userId: "gm-1" }, "player-1");
    expect(manager.reopenPlayerCanvas).not.toHaveBeenCalled();

    receive({ type: "REOPEN_PLAYER_CANVAS", userId: "player-2" }, "gm-1");
    expect(manager.reopenPlayerCanvas).toHaveBeenCalledOnce();
  });

  it("rejects malformed or unauthorized handout layouts", () => {
    setup({ id: "player-1", isGM: false });

    receive({ type: "HANDOUT_IMAGE_LAYOUT", data: { layout: [] } }, "player-1");
    expect(manager.handleHandoutImageLayout).not.toHaveBeenCalled();

    receive({ type: "HANDOUT_IMAGE_LAYOUT", data: { layout: [] } }, "gm-1");
    expect(manager.handleHandoutImageLayout).toHaveBeenCalledWith([], undefined, true);
  });
});
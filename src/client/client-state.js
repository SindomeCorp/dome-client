import { SOCKET_STATE_ENUM } from "./b-variables.js";

export const createClientState = () => ({
  userType: "p",
  socket: null,
  socketState: SOCKET_STATE_ENUM.BEFORE_FIRST,
  titleBarText: null,
  gameHealth: [],
  spawned: {},
  makeEditor: null,
  ideWindow: null,
  autoCommands: [],
  refreshRecent(e) {
    e.preventDefault();
  }
});

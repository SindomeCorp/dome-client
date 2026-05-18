import logger from "./pages/logger.js";

export const dome = {};
export let socket = null;

export const defaultHeightOffset = 50;

export const subs = [];
export { logger };

export const MOO_STATUS_ENUM = {
  UNCHECKED: "UNCHECKED",
  UNKNOWN: "UNKNOWN",
  OK: "OK",
  WEBCLIENT_DOWN: "CLIENT_DOWN",
  WEBSITE_DOWN: "SITE_DOWN",
  MOO_OFFLINE: "MOO_DOWN",
  SEVERE_LAG: "LAG",
  NETWORK_ISSUE: "NETWORK"
};

export const SOCKET_STATE_ENUM = {
  RECONNECT_FAILED: -1, // we tried a number of times and gave up
  DISCONNECTED: 0, // we lost connection
  CONNECTED: 1, // we have a connection
  BEFORE_FIRST: 2 // we have yet to try for a connection
};

export function setSocket(newSocket) {
  socket = newSocket;
}

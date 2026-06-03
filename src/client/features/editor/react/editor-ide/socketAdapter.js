import { getSocket } from "../../editor-support.js";

export function emitInput(message) {
  const socket = getSocket();
  if (!socket || typeof socket.emit !== "function") return false;
  socket.emit("input", message);
  return true;
}

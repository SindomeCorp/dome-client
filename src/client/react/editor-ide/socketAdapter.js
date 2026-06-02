import { getSocket } from "../../s-editor.js";

export function emitInput(message) {
  const socket = getSocket();
  if (!socket) return false;
  socket.emit("input", message);
  return true;
}

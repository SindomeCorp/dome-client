import { EventEmitter } from "node:events";

export function createSocket() {
  const socket = new EventEmitter();
  socket.handshake = {
    address: "127.0.0.1",
    headers: {
      "user-agent": "UA",
      referer: "",
    }
  };
  const events = [];
  const origEmit = socket.emit;
  socket.emit = function(event, ...args) {
    events.push([event, ...args]);
    return origEmit.call(this, event, ...args);
  };
  // prevent unhandled "error" events from crashing tests
  socket.on("error", () => {});
  return { socket, events };
}

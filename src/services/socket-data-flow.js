import { StringDecoder } from "node:string_decoder";

const CLIENT_USER_MARKER = "#$# dome-client-user";
const decoders = new WeakMap();

export async function forwardMudData({
  data,
  moo,
  socket,
  logger,
  shortenEnabled,
  shortenUrls,
  getUserIdentity,
  telnetIacProcessor
}) {
  if (!socket.isActive) return;
  try {
    const displayData = telnetIacProcessor ? telnetIacProcessor.filter(data) : data;
    if (displayData.length === 0) {
      return;
    }
    let decoder = decoders.get(moo);
    if (!decoder) {
      decoder = new StringDecoder("utf8");
      decoders.set(moo, decoder);
    }
    let text = (socket.domeMarkerCarry || "") + decoder.write(displayData);
    socket.domeMarkerCarry = "";
    const markerIndex = text.indexOf(CLIENT_USER_MARKER);
    if (markerIndex !== -1) {
      const identity = Object.prototype.hasOwnProperty.call(socket, "hostname") ? socket.hostname : getUserIdentity(socket);
      moo.write("@dome-client-user " + identity + "\r\n", "utf8");
      const lineStart = text.lastIndexOf("\n", markerIndex) + 1;
      const lineEnd = text.indexOf("\n", markerIndex);
      text = text.slice(0, lineStart) + (lineEnd < 0 ? "" : text.slice(lineEnd + 1));
    }
    // Keep only a possible fragmented metadata marker, not ordinary output.
    for (let length = Math.min(text.length, CLIENT_USER_MARKER.length - 1); length > 0; length--) {
      if (!text.endsWith(CLIENT_USER_MARKER.slice(0, length))) continue;
      socket.domeMarkerCarry = text.slice(-length);
      text = text.slice(0, -length);
      break;
    }
    if (!text) return;
    if (!shortenEnabled || !socket.shortenUrls) {
      emitActiveData(socket, text);
      return;
    }
    let output = text;
    try {
      output = await shortenUrls(text);
    } catch (err) {
      logger.warn("url shortening failed", err);
    }
    // A preference change can arrive while the shortener request is pending.
    emitActiveData(socket, socket.shortenUrls ? output : text);
  } catch (err) {
    logger.error("exception caught when receiving data from the moo", err);
  }
}

function emitActiveData(socket, data) {
  if (socket.isActive) {
    socket.emit("data", data);
  }
}

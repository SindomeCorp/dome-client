const CLIENT_USER_MARKER = "#$# dome-client-user";

export async function forwardMudData({
  data,
  moo,
  socket,
  logger,
  shortenEnabled,
  shortenUrls,
  getUserIdentity
}) {
  try {
    const text = data.toString();
    if (text.indexOf(CLIENT_USER_MARKER) !== -1) {
      const identity = Object.prototype.hasOwnProperty.call(socket, "hostname") ? socket.hostname : getUserIdentity(socket);
      moo.write("@dome-client-user " + identity + "\r\n", "utf8");
      return;
    }
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
    emitActiveData(socket, output);
  } catch (err) {
    logger.error("exception caught when receiving data from the moo", err);
  }
}

function emitActiveData(socket, data) {
  if (socket.isActive) {
    socket.emit("data", data);
  }
}

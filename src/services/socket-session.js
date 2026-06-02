export function bindSocketSession({
  socket,
  moo,
  logger,
  poweredBy,
  shortenEnabled,
  logUser,
  logError
}) {
  const writeAsync = data => new Promise(resolve => moo.write(data, "utf8", resolve));

  moo.on("end", function() {
    logger.debug("moo connection sent end");
    if (socket.isActive) {
      logger.debug("socket is active, sending disconnect and marking inactive");
      socket.isActive = false;
      socket.emit("disconnected");
    } else {
      logger.debug("socket is no longer active");
    }
  });

  moo.on("error", function(err) {
    logger.error("moo error event occurred");
    logError(socket, err);
    if (socket.isActive) {
      socket.emit("error", err);
    }
  });

  socket.on("error", function(err) {
    logger.error("socket error event occurred");
    logError(socket, err);
  });

  socket.on("shorten-on", function() {
    if (!shortenEnabled) return;
    socket.shortenUrls = true;
  });

  socket.on("disconnect", function(data) {
    logUser(socket, "BYE");
    if (!socket.isActive) return;
    socket.isActive = false;
    if (data) {
      logger.debug("disconnected from client: " + data);
    }
    if (!moo.socketQuit) moo.write("@quit" + "\r\n", "utf8", function() {});
  });

  socket.on("input", async function(command) {
    if (command == null) {
      socket.emit("error", new Error("no input"));
      return;
    }
    logConnectCommand(socket, command, logUser);
    try {
      await writeAsync(command + "\r\n");
      if (command.match(/^@quit(\r\n)?$/)) {
        moo.socketQuit = true;
        socket.isActive = false;
        moo.end();
        socket.emit("disconnected");
      } else {
        socket.emit("status", "sent " + command.length + " characters");
      }
      socket.emit("status", "command sent from " + poweredBy + " to moo at " + new Date().toString());
    } catch (exception) {
      logger.error("exception while writing to moo");
      logger.error(exception.stack);
      if (socket.isActive) {
        socket.emit("error", exception);
      }
    }
  });
}

function logConnectCommand(socket, command, logUser) {
  if (command.indexOf("connect ") === -1 && command.indexOf("co ") === -1) {
    return;
  }
  const charmatch = command.match(/(connect|co) (\w+) \w/);
  if (charmatch) {
    const charname = charmatch[charmatch.length - 1];
    logUser(socket, "USR", [charname]);
  }
}

import { io } from "socket.io-client";
import { dome, logger, SOCKET_STATE_ENUM, setSocket } from "./b-variables.js";
import { store } from "./store.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const emitAsync = (socket, event, ...args) => new Promise((resolve, reject) => {
  socket.emit(event, ...args, (err) => {
    if (err) reject(err);
    else resolve();
  });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

dome.setupSocket = function() {
  dome.socket?.disconnect?.();
  const onDisconnectedHandler = function() {
    logger.info("disconnected");
    ioSocket.disconnect();
    if (dome.socketState != SOCKET_STATE_ENUM.CONNECTED) {
      logger.warn("disconnected before we connected!");
    }
    dome.socketState = SOCKET_STATE_ENUM.DISCONNECTED;
    if (dome.activeEditor) {
      dome.activeEditor.readingContent = false;
    }
    if (dome.setFadeText && dome.statusDisplay) dome.setFadeText(dome.statusDisplay, "DISCONNECTED", true);
    dome.disconnectView.overlay.classList.remove("hide");
    dome.disconnectView.buttonGroup.classList.remove("hide");
  };
  const onReconnectHandler = function() {
    dome.disconnectView.overlay.classList.add("hide");
    dome.disconnectView.buttonGroup.classList.add("hide");
  };
  const onReconnectFailedHandler = function() {
    dome.socketState = SOCKET_STATE_ENUM.RECONNECT_FAILED;
    ioSocket.disconnect();
    dome.disconnectView.overlay.classList.remove("hide");
    dome.disconnectView.buttonGroup.classList.remove("hide");
  };

  let initialCommand = false;
  const onConnectedHandler = async function() {
    if (dome.socketState == SOCKET_STATE_ENUM.DISCONNECTED) {
      onReconnectHandler();
    }
    dome.socketState = SOCKET_STATE_ENUM.CONNECTED;
    if (dome.inputReader) dome.inputReader.focus(); // focus the cursor in the input field
    if (dome.setFadeText && dome.statusDisplay) dome.setFadeText(dome.statusDisplay, "CONNECTED");

    if (!initialCommand) {
      await sleep(2000); // delayed input to account for latency
      let cmd;
      const guestCmd = store.get("dc-initial-command");
      if (guestCmd) {
        // remove guest auto-connect before emit so reconnect errors do not repeat forced guest login
        store.remove("dc-initial-command");
        if (dome.setWindowTitle) dome.setWindowTitle("Guest | " + gameName + " | " + poweredBy);
        try {
          await emitAsync(ioSocket, "input", guestCmd);
        } catch (err) {
          logger.error("failed to emit guest initial command", err);
        }
      } else if ((cmd = store.get("dc-user-login"))) {
        // user login
        const who = store.get("last-username");
        if (who) dome.alert.pattern = new RegExp(escapeRegex(who), "i");
        if (dome.setWindowTitle) dome.setWindowTitle(who + " | " + gameName + " | " + poweredBy);
        await emitAsync(ioSocket, "input", cmd);
        store.remove("dc-user-login");
      }
      if (window.shortenEnabled !== false && dome.preferences.shortenUrls) {
        await emitAsync(ioSocket, "shorten-on", "shorten-on");
        logger.info("enabling short urls");
      }
    }
    initialCommand = true;
  };

  const ioSocket = io("https:" == document.location.protocol ? socketUrlSSL : socketUrl, {
    "sync disconnect on unload": true // send 'disconnect' event when the page is left
  });
  setSocket(ioSocket);
  dome.socket = ioSocket;

  ioSocket.on("connected", () => {
    onConnectedHandler();
  });
  ioSocket.on("disconnected", () => {
    onDisconnectedHandler();
  });
  ioSocket.on("reconnect_failed", () => {
    onReconnectFailedHandler();
  });
  ioSocket.on("error", (e) => {
    if (dome.onErrorHandler) dome.onErrorHandler(e);
  });

  return ioSocket;
};

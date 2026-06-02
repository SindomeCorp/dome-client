import { io } from "socket.io-client";
import { logger, SOCKET_STATE_ENUM } from "./b-variables.js";
import { store } from "./store.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const emitAsync = (socket, event, ...args) => new Promise((resolve, reject) => {
  socket.emit(event, ...args, (err) => {
    if (err) reject(err);
    else resolve();
  });
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function setupSocket({
  client,
  win = globalThis.window,
  doc = globalThis.document,
  storage = store,
  ioClient = io,
  log = logger,
  socketUrlValue = globalThis.socketUrl,
  socketUrlSSLValue = globalThis.socketUrlSSL,
  gameNameValue = globalThis.gameName,
  poweredByValue = globalThis.poweredBy,
  sleepFn = sleep
} = {}) {
  client.socket?.disconnect?.();
  const onDisconnectedHandler = function() {
    log.info("disconnected");
    ioSocket.disconnect();
    if (client.socketState != SOCKET_STATE_ENUM.CONNECTED) {
      log.warn("disconnected before we connected!");
    }
    client.socketState = SOCKET_STATE_ENUM.DISCONNECTED;
    if (client.activeEditor) {
      client.activeEditor.readingContent = false;
    }
    client.resetSdwcNowrapState?.();
    if (client.setFadeText && client.statusDisplay) client.setFadeText(client.statusDisplay, "DISCONNECTED", true);
    client.disconnectView.overlay.classList.remove("hide");
    client.disconnectView.buttonGroup.classList.remove("hide");
  };
  const onReconnectHandler = function() {
    client.disconnectView.overlay.classList.add("hide");
    client.disconnectView.buttonGroup.classList.add("hide");
  };
  const onReconnectFailedHandler = function() {
    client.socketState = SOCKET_STATE_ENUM.RECONNECT_FAILED;
    ioSocket.disconnect();
    client.disconnectView.overlay.classList.remove("hide");
    client.disconnectView.buttonGroup.classList.remove("hide");
  };

  let initialCommand = false;
  const onConnectedHandler = async function() {
    if (client.socketState == SOCKET_STATE_ENUM.DISCONNECTED) {
      onReconnectHandler();
    }
    client.socketState = SOCKET_STATE_ENUM.CONNECTED;
    client.resetSdwcNowrapState?.();
    if (client.inputReader) client.inputReader.focus(); // focus the cursor in the input field
    if (client.setFadeText && client.statusDisplay) client.setFadeText(client.statusDisplay, "CONNECTED");

    if (!initialCommand) {
      await sleepFn(2000); // delayed input to account for latency
      let cmd;
      const guestCmd = storage.get("dc-initial-command");
      if (guestCmd) {
        // remove guest auto-connect before emit so reconnect errors do not repeat forced guest login
        storage.remove("dc-initial-command");
        if (client.setWindowTitle) client.setWindowTitle("Guest | " + gameNameValue + " | " + poweredByValue);
        try {
          await emitAsync(ioSocket, "input", guestCmd);
        } catch (err) {
          log.error("failed to emit guest initial command", err);
        }
      } else if ((cmd = storage.get("dc-user-login"))) {
        // user login
        const who = storage.get("last-username");
        if (who) client.alert.pattern = new RegExp(escapeRegex(who), "i");
        if (client.setWindowTitle) client.setWindowTitle(who + " | " + gameNameValue + " | " + poweredByValue);
        await emitAsync(ioSocket, "input", cmd);
        storage.remove("dc-user-login");
      }
      if (win.shortenEnabled !== false && client.preferences.shortenUrls) {
        await emitAsync(ioSocket, "shorten-on", "shorten-on");
        log.info("enabling short urls");
      }
    }
    initialCommand = true;
  };

  const searchParams = win ? new URLSearchParams(win.location.search || "") : new URLSearchParams();
  const queryHost = (searchParams.get("gh") || "").trim();
  const queryPort = (searchParams.get("gp") || "").trim();
  const socketQuery = {};
  if (queryHost) {
    socketQuery.host = queryHost;
  }
  if (queryPort) {
    socketQuery.port = queryPort;
  }

  const ioSocket = ioClient("https:" == doc.location.protocol ? socketUrlSSLValue : socketUrlValue, {
    "sync disconnect on unload": true, // send 'disconnect' event when the page is left
    query: socketQuery
  });
  client.socket = ioSocket;

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
    if (client.onErrorHandler) client.onErrorHandler(e);
  });

  return ioSocket;
}

import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import { parse } from "../services/ua.js";
import config from "../config/index.js";
import { named, inspect } from "../logger.js";
import { urls as shortenUrls } from "../services/shorten.js";
import { dnsErrorHandler } from "../services/socket-utils.js";
import { recordConnection } from "../services/multi-mud-metrics.js";
import { connectToMud, DEFAULT_SOCKET_CONNECT_TIMEOUT_MS } from "../services/mud-connection.js";
import { resolveGameAddress } from "../services/socket-address.js";
import { forwardMudData } from "../services/socket-data-flow.js";
import { createTelnetIacProcessor } from "../services/telnet-iac-processor.js";
import { bindSocketSession } from "../services/socket-session.js";
import { handleTelnetIacEvent } from "./telnet-iac.js";

const logger = named("controllers/socket");

export function error(err) {
  logger.error(err);
  logger.debug("args:");
  inspect(arguments);
}

const SOCKET_PROXIED = config.node.socketProxied;
const SHORTEN_ENABLED = config.shorten.enabled;
const MULTI_MUD_ENABLED = config.node.multiMud;
const MUD_TLS_ENABLED = config.moo.tlsEnabled;

export function userIp(socket) {
  let handshakeAddress = socket.handshake.address;
  if (Object.hasOwn(handshakeAddress, "address")) {
    handshakeAddress = handshakeAddress.address;
  }
  const tempAddress = SOCKET_PROXIED ? (socket.handshake.headers["x-forwarded-for"] || handshakeAddress) : handshakeAddress;
  return tempAddress.replace("::ffff:", "");
}

export function logUser(socket, label, moreFields) {
  const isError = typeof label === "object" && (Object.prototype.hasOwnProperty.call(label, "message") || Object.prototype.hasOwnProperty.call(label, "code"));
  let fieldset = [isError ? "ERR" : label || "", userIp(socket)];
  if (moreFields && moreFields.length) fieldset = fieldset.concat(moreFields);
  const msg = fieldset.join(" ");
  isError ? logger.error(msg, label) : logger.info(msg);
}

export function logError(socket, err) {
  const userAgent = parse(socket.handshake.headers["user-agent"]);
  logUser(socket, err, [
    userAgent.toAgent(),
    userAgent.os.toString(),
    socket.handshake.headers.referer,
    userAgent.device && userAgent.device.toString() !== "Other 0.0.0" ? userAgent.device.toString() : "",
    err.message || err.code || ""
  ]);
}

export async function connection(socket) {
  socket.logger = logger;
  socket.logUser = logUser;
  socket.logError = logError;
  const gameAddress = resolveGameAddress(socket, {
    fallbackHost: config.moo.host,
    fallbackPort: config.moo.port,
    multiMudEnabled: MULTI_MUD_ENABLED,
    mudTlsEnabled: MUD_TLS_ENABLED
  });
  socket.gameAddress = gameAddress;
  const pendingConnection = new AbortController();
  const cancelConnection = () => pendingConnection.abort();
  socket.once("disconnect", cancelConnection);
  let moo;
  try {
    moo = await connectToMud({
      host: gameAddress.host,
      port: gameAddress.port,
      useTls: gameAddress.useTls,
      signal: pendingConnection.signal,
      timeoutMs: DEFAULT_SOCKET_CONNECT_TIMEOUT_MS,
      netConnect: net.connect,
      tlsConnect: tls.connect
    });
  } catch (err) {
    if (pendingConnection.signal.aborted) return;
    logger.error("error while connecting to moo");
    logError(socket, err);
    socket.emit("error", err.toString());
    return;
  } finally {
    socket.removeListener("disconnect", cancelConnection);
  }
  if (pendingConnection.signal.aborted || socket.disconnected === true) { moo.destroy(); return; }

  const onConnect = async () => {
    recordConnection(gameAddress.host, gameAddress.port, gameAddress.useTls);
    const address = userIp(socket);
    const userAgent = parse(socket.handshake.headers["user-agent"]);
    logUser(socket, "HI ", [
      userAgent.toAgent(),
      userAgent.os.toString(),
      socket.handshake.headers.referer,
      userAgent.device && userAgent.device.toString() !== "Other 0.0.0" ? userAgent.device.toString() : ""
    ]);
    socket.hostname = address;
    try {
      const domains = await dns.promises.reverse(address);
      if (domains && domains.length) {
        socket.hostname = domains[0];
        logUser(socket, "DNS", [
          socket.hostname,
          userAgent.device && userAgent.device.toString() !== "Other 0.0.0" ? userAgent.device.toString() : ""
        ]);
      }
    } catch (err) {
      dnsErrorHandler(err, socket, address);
    }
    socket.isActive = true;
    socket.emit("connected", new Date().toString());
  };
  await onConnect();

  const telnetIacProcessor = createTelnetIacProcessor({
    onEvent: handleTelnetIacEvent,
    logger
  });

  moo.on("data", async function(data) {
    await forwardMudData({
      data,
      moo,
      socket,
      logger,
      shortenEnabled: SHORTEN_ENABLED,
      shortenUrls,
      getUserIdentity: userIp,
      telnetIacProcessor
    });
  });

  bindSocketSession({
    socket,
    moo,
    logger,
    poweredBy: config.node.poweredBy,
    shortenEnabled: SHORTEN_ENABLED,
    logUser,
    logError
  });
}

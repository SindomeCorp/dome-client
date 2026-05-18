import net from "node:net";
import dns from "node:dns";
import path from "node:path";
import { parse } from "../services/ua.js";
import config from "../config/index.js";
import { named, inspect } from "../logger.js";
import { urls as shortenUrls } from "../services/shorten.js";
import { dnsErrorHandler } from "../services/socket-utils.js";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const logger = named("controllers/" + path.basename(__filename, ".js"));

export function error(err) {
  logger.error(err);
  logger.debug("args:");
  inspect(arguments);
}

const SOCKET_PROXIED = config.node?.socketProxied ?? false;
const SHORTEN_ENABLED = config.shorten?.enabled ?? true;

export function userIp(socket) {
  let handshakeAddress = socket.handshake.address;
  if (typeof handshakeAddress === "object" && Object.prototype.hasOwnProperty.call(handshakeAddress, "address")) {
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
  socket.isActive = true;
  socket.logger = logger;
  socket.logUser = logUser;
  socket.logError = logError;
  let moo;
  try {
    moo = await new Promise((resolve, reject) => {
      const conn = net.connect({ port: config.moo.port, host: config.moo.host });
      conn.once("connect", () => resolve(conn));
      conn.once("error", reject);
    });
  } catch (err) {
    logger.error("error while connecting to moo");
    logError(socket, err);
    socket.emit("error", err.toString());
    return;
  }

  const onConnect = async () => {
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

  const writeAsync = data => new Promise(r => moo.write(data, "utf8", r));

  moo.on("data", async function(data) {
    try {
      data = data.toString();
      const marker = data.indexOf("#$# dome-client-user");
      if (marker != -1) {
        moo.write("@dome-client-user " + (Object.prototype.hasOwnProperty.call(socket, "hostname") ? socket.hostname : userIp(socket)) + "\r\n", "utf8");
      } else {
        if (!SHORTEN_ENABLED || !socket.shortenUrls) {
          if (socket.isActive) {
            socket.emit("data", data);
          }
        } else {
          let output = data;
          try {
            output = await shortenUrls(data);
          } catch (err) {
            logger.warn("url shortening failed", err);
          }
          if (socket.isActive) {
            socket.emit("data", output);
          }
        }
      }
    } catch (e) {
      logger.error("exception caught when receiving data from the moo", e);
    }
  });

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

  moo.on("error", function(e) {
    logger.error("moo error event occurred");
    logError(socket, e);
    if (socket.isActive) {
      socket.emit("error", e);
    }
  });

  socket.on("error", function(e) {
    logger.error("socket error event occurred");
    logError(socket, e);
  });

  socket.on("shorten-on", function() {
    if (!SHORTEN_ENABLED) return;
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
    if (command.indexOf("connect ") != -1 || command.indexOf("co ") != -1) {
      const charmatch = command.match(/(connect|co) (\w+) \w/);
      if (charmatch) {
        const charname = charmatch[charmatch.length - 1];
        logUser(socket, "USR", [charname]);
      }
    }
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
      socket.emit("status", "command sent from " + config.node.poweredBy + " to moo at " + new Date().toString());
    } catch (exception) {
      logger.error("exception while writing to moo");
      logger.error(exception.stack);
      if (socket.isActive) {
        socket.emit("error", exception);
      }
    }
  });
}

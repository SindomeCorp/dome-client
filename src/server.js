/** General Requires **/
import config from "./config/index.js";
import path from "node:path";
import { named } from "./logger.js";
import { Server } from "socket.io";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import express from "express";
import expressLayouts from "express-ejs-layouts";
import cookieParser from "cookie-parser";
import session from "express-session";
import morgan from "morgan";
import { deviceCapture } from "./services/ua.js";
import build from "./services/build.js";
import { getLogExportCss } from "./services/log-export-style.js";
import router from "./routes/index.js";
import * as socket from "./controllers/socket.js";
import { fileURLToPath } from "node:url";
import { createApp } from "./server/app.js";
import { createHttpServers } from "./server/servers.js";
import { bindSocketManagers } from "./server/socket-managers.js";
import { close, listen, resolveBoundAddress } from "./server/lifecycle.js";
import { loadIpBlocklist } from "./services/ip-blocklist.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const logger = named("client-app");
const packageJsonPath = path.join(__dirname, "..", "package.json");

function getPackageVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return packageJson?.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Constants **/
const versionHash = process.env.GIT_HASH || "t" + new Date().getTime();
const APP_START_TIME = new Date();
const appVersion = process.env.APP_VERSION || getPackageVersion();
const ipBlocklist = loadIpBlocklist({
  filePath: config.security?.ipBlocklistPath,
  fs,
  logger
});

/** Build Express & Start the HTTP Server **/
const app = createApp({
  config,
  logger,
  express,
  expressLayouts,
  cookieParser,
  session,
  morgan,
  deviceCapture,
  getLogExportCss,
  router,
  appStartTime: APP_START_TIME,
  versionHash,
  appVersion,
  ipBlocklist
});
const { server, httpMgr, sslServer, httpsMgr } = createHttpServers({
  app,
  config,
  logger,
  ipBlocklist,
  fs,
  http,
  https,
  SocketServer: Server
});

let socketManagersBound = false;
let uncaughtExceptionBound = false;

function bindStartupSideEffects() {
  if (!socketManagersBound) {
    bindSocketManagers({ httpMgr, httpsMgr, socket });
    socketManagersBound = true;
  }
  if (!uncaughtExceptionBound) {
    process.on("uncaughtException", onUncaughtException);
    uncaughtExceptionBound = true;
  }
}

export async function start(options = {}) {
  const {
    port = config.node.port,
    ip = config.node.ip,
    httpsPort = config.ssl?.port,
    skipBuild = false
  } = options;
  bindStartupSideEffects();
  if (!skipBuild) {
    try {
      await build();
    } catch (err) {
      logger.error("asset build failed", err);
    }
  }
  if (config.autocomplete.enabled !== false) {
    try {
      await fs.promises.readFile(config.autocomplete.p);
    } catch (err) {
      logger.error("error while checking for autocomplete file ", err);
    }
  }
  const vDesc = "dome-client.js v" + app.get("version");
  if (ip) {
    await listen(server, port, ip);
    logger.info(vDesc + " (node " + process.version + ") listening on ip " + ip + " and port " + port);
    if (config.ssl) {
      await listen(sslServer, httpsPort, ip);
      logger.info(vDesc + " (node " + process.version + ") listening on ip " + ip + " and port " + httpsPort);
    }
  } else {
    await listen(server, port);
    logger.info(vDesc + " (node " + process.version + ") listening on port " + port);
    if (config.ssl) {
      await listen(sslServer, httpsPort);
      logger.info(vDesc + " (node " + process.version + ") listening on port " + httpsPort);
    }
  }
  return {
    http: resolveBoundAddress(server),
    https: resolveBoundAddress(sslServer),
    app
  };
}

export async function stop() {
  await close(httpMgr);
  await close(server);
  await close(httpsMgr);
  await close(sslServer);
  if (uncaughtExceptionBound) {
    process.removeListener("uncaughtException", onUncaughtException);
    uncaughtExceptionBound = false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}

function onUncaughtException(err) {
  logger.error("uncaught exception", err);
}

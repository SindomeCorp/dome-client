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

/** Build Express & Start the HTTP Server **/
const app = express();
app.disable("x-powered-by");
app.set("appStartTime", APP_START_TIME);
const server = http.createServer(app);
const httpMgr = new Server(server);
app.set("socketServer", httpMgr);
logger.info("socket.io listening to http");
let httpsMgr;
let sslServer;

/** Figure out if we're using SSL or not **/
if (config.ssl) {
  const sslOptions = {
    key: fs.readFileSync(config.ssl.key),
    cert: fs.readFileSync(config.ssl.cert)
  };
  if (config.ssl.ca) {
    sslOptions["ca"] = fs.readFileSync(config.ssl.ca);
  }
  if (config.ssl.passphrase) {
    sslOptions["passphrase"] = config.ssl.passphrase;
  }
  sslServer = https.createServer(sslOptions, app);
  httpsMgr = new Server(sslServer, sslOptions);
  app.set("httpsSocketServer", httpsMgr);
  logger.info("socket.io listening to https");
}

/** Setup logging: 3 is debug, 2 is info **/

/** Setup Express **/
app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "ejs");
app.use(expressLayouts);
app.set("layout", "layouts/main");
app.set("cachingHash", versionHash);
app.set("version", appVersion);

/** Setup Express Middleware **/
app.use(morgan("dev", {
  skip(req) {
    return ["/moo/status/", "/moo/status", "/health/", "/health"].includes(req.path);
  },
  stream: {
    write(msg) {
      logger.info(msg.trim());
    }
  }
}));

app.use(deviceCapture());
app.use(cookieParser());
app.use(express.urlencoded({
  extended: false,
  limit: "50mb"
}));
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: config.node.session.secret
}));
app.use(function(req, res, next) {
  res.locals.socketUrl = config.node.socketUrl;
  res.locals.socketUrlSSL = config.node.socketUrlSSL;
  res.locals.req = req;
  res.locals.debugMode = config.node.mode == "production" ? false : true;
  res.locals.session = req.session;
  res.locals.decache = function(url) {
    return "" + url + "?" + app.get("cachingHash");
  };
  res.locals.version = app.get("version");
  res.locals.poweredBy = config.node.poweredBy;
  res.locals.gameName = config.moo.name;
  res.locals.guestConnectCommand = config.guest.connectCommand;
  res.locals.isMultiMud = config.node.multiMud === true;
  res.locals.shortenEnabled = config.shorten.enabled;
  res.locals.logExportCss = getLogExportCss();
  res.locals.showReporter = function(req) {
    let ua = req.headers["user-agent"];
    if (ua && ua.match("MSAppHost")) {
      return false;
    }
    return true;
  };
  next();
});

app.use("/css", express.static(path.join(__dirname, "../public/css"), { dotfiles: "ignore" }));
app.use(express.static(path.join(__dirname, "../public"), { dotfiles: "ignore" }));

function listen(server, ...args) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(...args, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

export async function start() {
  try {
    await build();
  } catch (err) {
    logger.error("asset build failed", err);
  }
  if (config.autocomplete.enabled !== false) {
    try {
      await fs.promises.readFile(config.autocomplete.p);
    } catch (err) {
      logger.error("error while checking for autocomplete file ", err);
    }
  }
  const vDesc = "dome-client.js v" + app.get("version");
  if (config.node["ip"]) {
    await listen(server, config.node.port, config.node.ip);
    logger.info(vDesc + " (node " + process.version + ") listening on ip " + config.node.ip + " and port " + config.node.port);
    if (config.ssl) {
      await listen(sslServer, config.ssl.port, config.node.ip);
      logger.info(vDesc + " (node " + process.version + ") listening on ip " + config.node.ip + " and port " + config.ssl.port);
    }
  } else {
    await listen(server, config.node.port);
    logger.info(vDesc + " (node " + process.version + ") listening on port " + config.node.port);
    if (config.ssl) {
      await listen(sslServer, config.ssl.port);
      logger.info(vDesc + " (node " + process.version + ") listening on port " + config.ssl.port);
    }
  }
}

function close(server) {
  return new Promise(resolve => {
    if (!server || typeof server.close !== "function") {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

export async function stop() {
  await close(httpMgr);
  await close(server);
  await close(httpsMgr);
  await close(sslServer);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}

httpMgr.on("connection", function(sock) {
  socket.connection(sock, httpMgr);
});

httpMgr.on("error", socket.error);

if (config.ssl) {
  httpsMgr.on("connection", socket.connection);
  httpsMgr.on("error", socket.error);
}

process.on("uncaughtException", function(err) {
  logger.error("uncaught exception", err);
});

/** Define the general routes **/
app.use(router);

app.use((err, req, res, next) => {
  logger.error("request error", err);
  res.status(500).json({ error: "Internal Server Error" });
  void next;
});

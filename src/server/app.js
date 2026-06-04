import path from "node:path";
import { fileURLToPath } from "node:url";
import defaultExpress from "express";
import defaultExpressLayouts from "express-ejs-layouts";
import defaultCookieParser from "cookie-parser";
import defaultSession from "express-session";
import defaultMorgan from "morgan";
import { deviceCapture as defaultDeviceCapture } from "../services/ua.js";
import { getLogExportCss as defaultGetLogExportCss } from "../services/log-export-style.js";
import defaultRouter from "../routes/index.js";
import { CLIENT_OPTION_GROUPS, CLIENT_OPTION_LABELS, CLIENT_OPTION_VIEW } from "../shared/client-options.js";

const __dirname = fileURLToPath(new URL("..", import.meta.url));

export function createApp({
  config,
  logger,
  express = defaultExpress,
  expressLayouts = defaultExpressLayouts,
  cookieParser = defaultCookieParser,
  session = defaultSession,
  morgan = defaultMorgan,
  deviceCapture = defaultDeviceCapture,
  getLogExportCss = defaultGetLogExportCss,
  router = defaultRouter,
  appStartTime = new Date(),
  versionHash,
  appVersion
}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("appStartTime", appStartTime);

  app.set("views", path.join(__dirname, "../views"));
  app.set("view engine", "ejs");
  app.use(expressLayouts);
  app.set("layout", "layouts/main");
  app.set("cachingHash", versionHash);
  app.set("version", appVersion);

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
    res.locals.clientOptionLabels = CLIENT_OPTION_LABELS;
    res.locals.clientOptionView = CLIENT_OPTION_VIEW;
    res.locals.clientOptionGroups = CLIENT_OPTION_GROUPS;
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

  if (config.node.healthEndpointEnabled === false) {
    app.use(["/health", "/health/"], (req, res) => {
      res.status(404).send("Not Found");
    });
  }

  app.use(router);

  app.use((err, req, res, next) => {
    logger.error("request error", err);
    res.status(500).json({ error: "Internal Server Error" });
    void next;
  });

  return app;
}

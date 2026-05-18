/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"], no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { named } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const logger = named("middleware/" + path.basename(__filename, ".js"));

export const metrics = {
  "404": {
    count: 0,
    urls: [],
    ips: []
  },
  "500": {
    count: 0,
    urls: [],
    ips: []
  }
};

function serveError(status, req, res, page) {
  metrics[status].count++;
  metrics[status].urls.push(page.url);
  metrics[status].ips.push(req.header("X-Forwarded-For"));
  if (metrics[status].urls.length > 20) {
    metrics[status].urls.shift();
    metrics[status].ips.shift();
  }
  res.status(status);
  res.render("errors/" + status, page);
}

export function notFound(err, req, res, next) {
  if (err && err.message == "404") {
    logger.warn(err);
    const page = {
      title: "File Not Found",
      meta: {
        title: "Not Found",
        description: "The file requested doesn't exist.",
        keywords: "404"
      },
      error: err,
      url: req.url
    };
    serveError(404, req, res, page);
  } else if (err) {
    next(err);
  } else {
    next();
  }
}

export function errorHandler(err, req, res, _next) {
  if (err) {
    logger.error("Unexpected Error Encountered from " + req.url, err);
    const page = {
      title: "Unexpected Error",
      meta: {
        title: "Unexpected Error",
        description: "Who really expects an error, anyway?",
        keywords: "500"
      },
      error: err,
      url: req.url
    };
    serveError(500, req, res, page);
  } else {
    const page = {
      title: "File Not Found",
      meta: {
        title: "Not Found",
        description: "The file requested doesn't exist.",
        keywords: "404"
      },
      error: err,
      url: req.url
    };
    return serveError(404, req, res, page);
  }
}

export const json = {};
json.errorHandler = function(err, req, res, _next) {
  if (!err) {
    err = new Error("File Not Found");
    err.code = 404;
  }
  logger.error(err);
  res.status(err.code ?? 500).json({ status: "error", err, message: err.message });
};

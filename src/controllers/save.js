import path from "node:path";
import { fileURLToPath } from "node:url";
import { named } from "../logger.js";
import { buildLogHtml } from "../shared/log-template.js";
import { getLogExportCss } from "../services/log-export-style.js";

const __filename = fileURLToPath(import.meta.url);
const logger = named("controllers/" + path.basename(__filename, ".js"));

/**
 * Send the client's buffer as a downloadable HTML log.
 * Sets headers and wraps the provided buffer in minimal markup.
 *
 * @param {import("express").Request} req Express request containing
 * the `buffer` field in the body and `filename` path parameter.
 * @param {import("express").Response} res Express response.
 */
export function log(req, res) {
  logger.info("generating log for " + req.ip);
  const safeName = encodeURIComponent(path.basename(req.params.filename));
  res.setHeader("Content-disposition", "attachment; filename=" + safeName);
  res.setHeader("Content-type", "text/html");
  const html = buildLogHtml(req.body?.buffer, getLogExportCss());
  res.send(html);
}

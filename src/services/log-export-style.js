import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { named } from "../logger.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const logger = named("services/log-export-style");
const CSS_PATHS = [
  path.join(__dirname, "..", "..", "public", "css", "client.css"),
  path.join(__dirname, "..", "..", "public", "legacy", "client.css")
];

let cachedCss;

export function getLogExportCss() {
  if (cachedCss !== undefined) {
    return cachedCss;
  }

  for (const cssPath of CSS_PATHS) {
    try {
      cachedCss = fs.readFileSync(cssPath, "utf8");
      return cachedCss;
    } catch (err) {
      if (err?.code !== "ENOENT") {
        logger.warn("Unable to read log export css from " + cssPath, err);
      }
    }
  }

  logger.warn("No log export css found in expected locations.");
  cachedCss = "";
  return cachedCss;
}

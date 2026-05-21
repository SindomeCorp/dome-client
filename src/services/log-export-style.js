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

function addFontFallbacks(cssText) {
  if (!cssText) {
    return "";
  }
  let css = cssText;
  css = css.replace(
    /font-family:\s*['"]?Source Code Pro['"]?/g,
    "font-family:'Source Code Pro','Liberation Mono','DejaVu Sans Mono',monospace"
  );
  css = css.replace(
    /font-family:\s*['"]?Roboto Mono['"]?/g,
    "font-family:'Roboto Mono','Liberation Mono','DejaVu Sans Mono',monospace"
  );
  css = css.replace(
    /font-family:\s*['"]?Comic Mono['"]?/g,
    "font-family:'Comic Mono','Liberation Mono','DejaVu Sans Mono',monospace"
  );
  css = css.replace(
    /font-family:\s*['"]?Quantico['"]?/g,
    "font-family:'Quantico','Helvetica Neue',Helvetica,Arial,sans-serif"
  );
  return css;
}

export function getLogExportCss() {
  if (cachedCss !== undefined) {
    return cachedCss;
  }

  for (const cssPath of CSS_PATHS) {
    try {
      cachedCss = addFontFallbacks(fs.readFileSync(cssPath, "utf8"));
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

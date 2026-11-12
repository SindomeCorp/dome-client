import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateOutputRule } from "../shared/output-windows.js";

const root = fileURLToPath(new URL("../../", import.meta.url));

export function loadOutputWindowPresets({ filePath = "data/output-window-presets.json", readFile = fs.readFileSync, logger } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(readFile(path.resolve(root, filePath), "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Expected an array of output window presets.");
  } catch (error) {
    logger?.warn?.("Unable to load output window presets: " + error.message);
    return [];
  }
  const ids = new Set();
  return parsed.flatMap((item) => {
    const checked = validateOutputRule(item);
    if (!checked.rule || ids.has(checked.rule.id) || checked.rule.id.startsWith("custom-")) {
      logger?.warn?.("Skipping invalid output window preset: " + (checked.error || "duplicate or reserved ID"));
      return [];
    }
    ids.add(checked.rule.id);
    return [checked.rule];
  });
}

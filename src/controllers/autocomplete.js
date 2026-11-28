import fs from "node:fs";
import { named } from "../logger.js";
import config from "../config/index.js";

const logger = named("controllers/autocomplete");

const AUTOCOMPLETE = {};

function isAutocompleteEnabled() {
  // Treat missing flag in test mocks as enabled for backward compatibility.
  return config.autocomplete.enabled !== false;
}

export async function ac(usertype) {
  if (!isAutocompleteEnabled()) {
    return [];
  }
  if (AUTOCOMPLETE[usertype]) {
    return AUTOCOMPLETE[usertype];
  } else if (config.autocomplete[usertype]) {
    logger.debug(config.autocomplete[usertype]);
    try {
      const data = await fs.promises.readFile(config.autocomplete[usertype], "utf8");
      AUTOCOMPLETE[usertype] = data.split("\n");
      return AUTOCOMPLETE[usertype];
    } catch (err) {
      logger.error(err);
      throw err;
    }
  }
  return [];
}

export async function basic(req, res) {
  try {
    const cmds = await ac(req.params.type);
    return res.json(cmds);
  } catch (err) {
    logger.error(err);
    return res.status(500).json({ error: "Failed to load autocomplete data" });
  }
}

export function clearCache() {
  for (const key of Object.keys(AUTOCOMPLETE)) {
    delete AUTOCOMPLETE[key];
  }
}

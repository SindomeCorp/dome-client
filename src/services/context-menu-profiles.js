import { readFileSync } from "node:fs";
import { contextProfileRegistry } from "../shared/context-menu-profiles.js";
import { validateContextMenus } from "../shared/context-menu-validation.js";

// Only client-owned registry paths are resolved. Neither OOB nor request data enters here.
export function getContextMenuAvailability({ enabled = true, readFile = readFileSync, logger } = {}) {
  if (!enabled) return { enabled: false };
  const errors = [];
  let usable = 0;
  for (const [id, path] of Object.entries(contextProfileRegistry)) {
    try {
      const text = readFile(new URL("../../data" + path, import.meta.url), "utf8");
      if (text.length > 262144) throw new Error("Profile exceeds 256 KiB.");
      const snapshot = validateContextMenus(JSON.parse(text));
      if (snapshot.profiles.size !== 1 || !snapshot.profiles.has(id)) throw new Error("Expected registered profile ID " + id + ".");
      const profile = snapshot.profiles.get(id);
      if (!profile.selectionActions.length && !profile.rules.some((rule) => snapshot.rules.get(rule).actions.length)) throw new Error("Profile has no actions.");
      usable++;
    } catch (error) {
      errors.push(id + ": " + error.message);
    }
  }
  if (!usable) logger.error("Context menus disabled: no usable registered JSON profile files. " + errors.join("; "));
  else if (errors.length) logger.warn("Unavailable context-menu profiles: " + errors.join("; "));
  return { enabled: usable > 0 };
}

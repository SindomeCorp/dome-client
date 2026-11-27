import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { contextProfileRegistry } from "../shared/context-menu-profiles.js";
import { validateContextMenus } from "../shared/context-menu-validation.js";

export function checkContextProfileRuntime(config, run = spawnSync) {
  const result = run(process.execPath, [fileURLToPath(new URL("./context-menu-profile-check.js", import.meta.url))], {
    input: JSON.stringify(config), encoding: "utf8", timeout: 3000, maxBuffer: 16384, windowsHide: true
  });
  if (result.error || result.status !== 0) throw new Error("Profile validation failed or timed out: " + (result.error?.message || "validator exited"));
  const response = JSON.parse(result.stdout);
  if (!response.ok) throw new Error(response.error || "Profile validation failed.");
}

// Only client-owned registry paths are resolved. Neither OOB nor request data enters here.
export function getContextMenuAvailability({ enabled = true, readFile = readFileSync, logger } = {}) {
  if (!enabled) return { enabled: false };
  const errors = [];
  let usable = 0;
  for (const [id, path] of Object.entries(contextProfileRegistry)) {
    try {
      const text = readFile(new URL("../../data" + path, import.meta.url), "utf8");
      if (text.length > 262144) throw new Error("Profile exceeds 256 KiB.");
      const config = JSON.parse(text);
      const snapshot = validateContextMenus(config);
      if (snapshot.profiles.size !== 1 || !snapshot.profiles.has(id)) throw new Error("Expected registered profile ID " + id + ".");
      const profile = snapshot.profiles.get(id);
      if (!profile.selectionActions.length && !profile.rules.some((rule) => snapshot.rules.get(rule).actions.length)) throw new Error("Profile has no actions.");
      checkContextProfileRuntime(config);
      usable++;
    } catch (error) {
      errors.push(id + ": " + error.message);
    }
  }
  if (!usable) logger.error("Context menus disabled: no usable registered JSON profile files. " + errors.join("; "));
  else if (errors.length) logger.warn("Unavailable context-menu profiles: " + errors.join("; "));
  return { enabled: usable > 0 };
}

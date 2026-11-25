import { validateContextMenus } from "./context-menus.js";

export const contextProfileRegistry = Object.freeze({
  player: "/profiles/player.json",
  gm: "/profiles/gm.json",
  programmer: "/profiles/programmer.json"
});

export async function loadContextProfiles({ fetchFn = globalThis.fetch, ids = Object.keys(contextProfileRegistry) } = {}) {
  const results = await Promise.all(Object.entries(contextProfileRegistry).filter(([id]) => ids.includes(id)).map(async ([id, path]) => {
    try {
      const response = await fetchFn(path, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const text = await response.text();
      if (text.length > 262144) throw new Error("Profile exceeds 256 KiB.");
      const config = JSON.parse(text);
      const snapshot = validateContextMenus(config);
      if (snapshot.profiles.size !== 1 || !snapshot.profiles.has(id)) throw new Error("Expected exactly the registered profile ID " + id + ".");
      return { id, config };
    } catch (error) { return { id, error: id + ": " + error.message }; }
  }));
  return { documents: results.filter((result) => result.config), errors: results.filter((result) => result.error).map((result) => result.error) };
}

export function mergeContextProfiles(local, documents) {
  const rules = new Map();
  const profiles = new Map();
  for (const config of [...documents.map((document) => document.config), local]) {
    for (const rule of config.rules) rules.set(rule.id, rule);
    for (const profile of config.profiles) profiles.set(profile.id, profile);
  }
  return { version: 1, rules: [...rules.values()], profiles: [...profiles.values()] };
}

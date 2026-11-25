import { validateContextMenus, compileContextRules, matchContextRules } from "../../shared/context-menus.js";

let profiles;
self.addEventListener("message", ({ data }) => {
  try {
    if (data.type === "configure") {
      const snapshot = validateContextMenus(data.config);
      const rules = compileContextRules([...snapshot.rules.values()]);
      matchContextRules("", rules);
      const compiled = new Map(rules.map((rule) => [rule.id, rule]));
      profiles = new Map([...snapshot.profiles.values()].map((profile) => [profile.id, profile.rules.map((id) => compiled.get(id))]));
      self.postMessage({ id: data.id, result: true });
    } else {
      const rules = profiles?.get(data.profile);
      if (!rules) throw new Error("Unknown context profile rules.");
      self.postMessage({ id: data.id, result: matchContextRules(data.text, rules) });
    }
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
});

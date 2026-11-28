import { readFileSync } from "node:fs";
import { validateContextMenus, compileContextRules, matchContextRules } from "../shared/context-menu-validation.js";

// This process only validates client-owned file contents. Its parent bounds
// execution, just as the browser bounds worker configuration.
try {
  const snapshot = validateContextMenus(JSON.parse(readFileSync(0, "utf8")));
  matchContextRules("", compileContextRules([...snapshot.rules.values()]));
  process.stdout.write(JSON.stringify({ ok: true }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error.message }));
}

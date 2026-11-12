export const OUTPUT_WINDOWS_STORAGE_KEY = "dc-output-windows";

export function outputWindowDefaults() {
  return { version: 1, open: false, position: "right", secondarySize: 30, selected: [], custom: [] };
}

export function validateOutputRule(rule) {
  if (!rule || typeof rule !== "object" || typeof rule.id !== "string" || !rule.id.trim()
    || typeof rule.name !== "string" || !rule.name.trim()
    || typeof rule.pattern !== "string" || !rule.pattern.trim()
    || (rule.ignoreCase != null && typeof rule.ignoreCase !== "boolean")) {
    return { error: "A rule needs an ID, a name, a pattern, and an optional Ignore case boolean." };
  }
  try {
    new RegExp(rule.pattern, rule.ignoreCase ? "i" : "");
  } catch (error) {
    return { error: error.message };
  }
  return { rule: { id: rule.id.trim(), name: rule.name.trim(), pattern: rule.pattern, ignoreCase: rule.ignoreCase === true } };
}

export function normalizeOutputWindows(value) {
  const result = outputWindowDefaults();
  let skipped = 0;
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) {
    return { value: result, skipped: 1, valid: false };
  }
  result.open = value.open === true;
  if (["left", "right", "top", "bottom"].includes(value.position)) result.position = value.position;
  if (Number.isFinite(value.secondarySize)) result.secondarySize = Math.max(15, Math.min(85, value.secondarySize));
  const ids = new Set();
  for (const item of Array.isArray(value.custom) ? value.custom : []) {
    const checked = validateOutputRule(item);
    if (!checked.rule || !item.id.startsWith("custom-") || ids.has(item.id)) {
      skipped++;
      continue;
    }
    ids.add(item.id);
    result.custom.push(checked.rule);
  }
  result.selected = [...new Set((Array.isArray(value.selected) ? value.selected : []).filter((id) => typeof id === "string"))];
  return { value: result, skipped, valid: true };
}

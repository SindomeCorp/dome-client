export const OUTPUT_WINDOWS_STORAGE_KEY = "dc-output-windows";
export const MAX_ADDITIONAL_SPLITS = 8;

export function outputWindowDefaults() {
  return {
    version: 1,
    open: false,
    secondaryOpen: true,
    position: "right",
    arrangement: "stacked",
    secondarySize: 30,
    selected: [],
    custom: [],
    splits: []
  };
}

function validateOutputSplit(split, fallbackIndex = 2) {
  if (!split || typeof split !== "object" || Array.isArray(split)
    || typeof split.id !== "string" || !split.id.trim()
    || split.id.trim() === "main" || split.id.trim() === "secondary") {
    return { error: "A split window needs a unique non-reserved ID." };
  }
  const id = split.id.trim();
  const name = typeof split.name === "string" && split.name.trim() ? split.name.trim() : "Split " + fallbackIndex;
  const open = split.open !== false;
  const size = Number.isFinite(split.size) ? Math.max(15, Math.min(85, split.size)) : 50;
  const selected = [...new Set((Array.isArray(split.selected) ? split.selected : []).filter((item) => typeof item === "string"))];
  return { split: { id, name, open, size, selected } };
}

export function createNextSplit(splits = [], selected = []) {
  const used = new Set((Array.isArray(splits) ? splits : []).map((item) => item?.id));
  let index = 2;
  while (used.has("split-" + index)) index++;
  return {
    id: "split-" + index,
    name: "Split " + index,
    open: true,
    size: 50,
    selected: [...new Set((Array.isArray(selected) ? selected : []).filter((item) => typeof item === "string"))]
  };
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
  result.secondaryOpen = value.secondaryOpen !== false;
  if (["left", "right", "top", "bottom"].includes(value.position)) result.position = value.position;
  if (["stacked", "parallel"].includes(value.arrangement)) result.arrangement = value.arrangement;
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
  const splitIds = new Set();
  for (const item of Array.isArray(value.splits) ? value.splits : []) {
    if (result.splits.length >= MAX_ADDITIONAL_SPLITS) {
      skipped++;
      continue;
    }
    const checked = validateOutputSplit(item, result.splits.length + 2);
    if (!checked.split || splitIds.has(checked.split.id)) {
      skipped++;
      continue;
    }
    splitIds.add(checked.split.id);
    result.splits.push(checked.split);
  }
  if (!result.secondaryOpen && !result.splits.some((split) => split.open)) {
    result.secondaryOpen = true;
  }
  return { value: result, skipped, valid: true };
}

import { coerceOptionValue } from "../../../shared/client-options.js";

const EXPORT_TYPE = "dome-client-options";
const EXPORT_VERSION = 1;

function buildClientOptionsExportPayload({ optionNames, getOptionState, exportedAt = new Date() }) {
  const preferences = {};
  optionNames.forEach((name) => {
    preferences[name] = getOptionState(name);
  });
  return {
    type: EXPORT_TYPE,
    version: EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    preferences,
  };
}

function buildClientOptionsExportFilename(exportedAt = new Date()) {
  return `dome-client-options-${exportedAt.toISOString().replace(/[:.]/g, "-")}.json`;
}

function normalizeImportedValue(name, value) {
  if (name === "edittheme" && value === "ambiance") return "ambience";
  if (name === "edittheme" && value === "tomorrow") return "tomorrow_night";
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function getImportSource(parsed) {
  return parsed && typeof parsed === "object" && parsed.preferences && typeof parsed.preferences === "object"
    ? parsed.preferences
    : parsed;
}

function buildClientOptionsImportPlan({ parsed, options }) {
  const source = getImportSource(parsed);
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {
      valid: false,
      error: "JSON must be an object of option keys."
    };
  }

  const applied = [];
  let skipped = 0;
  Object.entries(source).forEach(([name, value]) => {
    if (!Object.prototype.hasOwnProperty.call(options, name)) return;
    const normalized = normalizeImportedValue(name, value);
    const coerced = coerceOptionValue(options[name], normalized);
    if (!coerced.valid) {
      skipped++;
      return;
    }
    applied.push({ name, value: coerced.value });
  });

  return {
    valid: true,
    applied,
    skipped
  };
}

export {
  buildClientOptionsExportFilename,
  buildClientOptionsExportPayload,
  buildClientOptionsImportPlan,
  normalizeImportedValue
};

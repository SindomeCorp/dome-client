import {
  buildClientOptionsExportFilename,
  buildClientOptionsExportPayload,
  buildClientOptionsImportPlan
} from "./client-options-import-export.js";
import { SECONDARY_PRESENTATION_OPTIONS, getPreferenceNameForOptionKey } from "../../../shared/client-options.js";

export function buildExportPayload({ options, actions = {} }) {
  const payload = buildClientOptionsExportPayload({
    optionNames: Object.keys(options.options),
    getOptionState: (name) => options.get(name).state
  });
  const outputWindows = actions.getOutputWindows?.();
  if (outputWindows) payload.outputWindows = outputWindows;
  return payload;
}

function downloadClientOptionsJson({
  doc = globalThis.document,
  nav = globalThis.navigator,
  urlApi = globalThis.URL,
  blobCtor = globalThis.Blob,
  options,
  actions,
  showToast
} = {}) {
  if (!doc || !blobCtor) {
    actions.appendOutput("Client options export is not supported in this environment.\n");
    actions.scrollBuffer();
    return;
  }
  const payload = buildExportPayload({ options, actions });
  const filename = buildClientOptionsExportFilename();
  const blob = new blobCtor([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });

  if (nav?.msSaveOrOpenBlob) {
    nav.msSaveOrOpenBlob(blob, filename);
    showToast("Preferences exported.");
    return;
  }

  const url = urlApi.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
  urlApi.revokeObjectURL(url);
  showToast("Preferences exported.");
}

export async function importClientOptionsJson({
  file,
  options,
  actions,
  applyOptionValue,
  refreshClientOptions,
  showToast
}) {
  if (!file) return;
  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    actions.appendOutput("Client options import error: invalid JSON file.\n");
    actions.scrollBuffer();
    showToast("Import failed.", true);
    return;
  }

  const plan = buildClientOptionsImportPlan({
    parsed,
    options: options.options
  });
  if (!plan.valid) {
    actions.appendOutput(`Client options import error: ${plan.error}\n`);
    actions.scrollBuffer();
    showToast("Import failed.", true);
    return;
  }

  plan.applied.forEach(({ name, value }) => {
    applyOptionValue(name, value);
  });
  for (const [secondary, main] of Object.entries(SECONDARY_PRESENTATION_OPTIONS)) {
    if (options.options[secondary] && !plan.applied.some(({ name }) => name === secondary)) {
      applyOptionValue(secondary, actions.getPreference?.(getPreferenceNameForOptionKey(main)) ?? options.get(main).state);
    }
  }
  let outputSkipped = 0;
  if (Object.prototype.hasOwnProperty.call(parsed, "outputWindows")) {
    const result = actions.importOutputWindows?.(parsed.outputWindows);
    outputSkipped = result?.skipped || 0;
  }
  refreshClientOptions();
  actions.scrollBuffer();
  const applied = plan.applied.length;
  const skipped = plan.skipped + outputSkipped;
  actions.appendOutput(`Imported ${applied} client option${applied === 1 ? "" : "s"}.\n`);
  if (skipped > 0) {
    actions.appendOutput(`Skipped ${skipped} invalid imported option value${skipped === 1 ? "" : "s"}.\n`);
  }
  showToast("Preferences imported.");
}

export function bindImportExportControls({
  doc = globalThis.document,
  win = globalThis.window,
  options,
  actions,
  applyOptionValue,
  refreshClientOptions,
  showToast
} = {}) {
  const exportButton = doc.getElementById("client-options-export");
  const importButton = doc.getElementById("client-options-import");
  const importFileInput = doc.getElementById("client-options-import-file");
  const resetDefaultsButton = doc.getElementById("client-options-reset-defaults");
  if (!exportButton || !importButton || !importFileInput || !resetDefaultsButton) return;

  exportButton.addEventListener("click", () => {
    downloadClientOptionsJson({ doc, options, actions, showToast });
  });

  importButton.addEventListener("click", () => {
    const message = "Importing preferences will overwrite your current settings. This is destructive. Export a backup first. Continue?";
    if (typeof win !== "undefined" && typeof win.confirm === "function" && !win.confirm(message)) return;
    importFileInput.click();
  });

  importFileInput.addEventListener("change", async () => {
    const [file] = importFileInput.files || [];
    await importClientOptionsJson({
      file,
      options,
      actions,
      applyOptionValue,
      refreshClientOptions,
      showToast
    });
    importFileInput.value = "";
  });

  resetDefaultsButton.addEventListener("click", () => {
    const message = "Resetting to defaults will overwrite your current settings. This is destructive. Export a backup first. Continue?";
    if (typeof win !== "undefined" && typeof win.confirm === "function" && !win.confirm(message)) return;

    Object.entries(options.options).forEach(([name, optionDef]) => {
      applyOptionValue(name, optionDef.def);
    });
    actions.resetOutputWindows?.();
    refreshClientOptions();
    actions.appendOutput("Reset all client options to defaults.\n");
    actions.scrollBuffer();
    showToast("Defaults restored.");
  });
}

import {
  bindImportExportControls as bindImportExportControlsUi,
  buildExportPayload as buildExportPayloadForOptions,
  importClientOptionsJson as importClientOptionsJsonForOptions
} from "../client-options-import-export-ui.js";

function createClientOptionsImportExportBinder({
  options,
  getActions,
  applyOptionValue,
  refreshClientOptions,
  showToast
}) {
  function buildExportPayload() {
    return buildExportPayloadForOptions({ options });
  }

  async function importClientOptionsJson(file) {
    await importClientOptionsJsonForOptions({
      file,
      options,
      actions: getActions(),
      applyOptionValue,
      refreshClientOptions,
      showToast
    });
  }

  function bindImportExportControls() {
    bindImportExportControlsUi({
      options,
      actions: getActions(),
      applyOptionValue,
      refreshClientOptions,
      showToast
    });
  }

  return {
    bindImportExportControls,
    buildExportPayload,
    importClientOptionsJson
  };
}

export { createClientOptionsImportExportBinder };

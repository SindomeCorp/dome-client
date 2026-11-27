import logger from "../../core/logger.js";
import { showImportExportToast } from "./client-options-toast.js";
import { createClientOptionControlBinder } from "./page/controls.js";
import { createClientOptionsImportExportBinder } from "./page/import-export.js";
import { clientOptions, getClientOptionsActions } from "./client-options-runtime.js";

const optionControls = createClientOptionControlBinder({
  options: clientOptions,
  getActions: getClientOptionsActions,
  logger
});
const {
  applyOptionValue,
  bindOptionButtons,
  bindOptionInputs,
  bindOptionSelects,
  refreshClientOptions
} = optionControls;
const importExportControls = createClientOptionsImportExportBinder({
  options: clientOptions,
  getActions: getClientOptionsActions,
  applyOptionValue,
  refreshClientOptions,
  showToast: showImportExportToast
});
const {
  bindImportExportControls,
  buildExportPayload,
  importClientOptionsJson
} = importExportControls;

export { bindOptionButtons, bindOptionInputs, bindOptionSelects, bindImportExportControls, buildExportPayload, importClientOptionsJson, refreshClientOptions };

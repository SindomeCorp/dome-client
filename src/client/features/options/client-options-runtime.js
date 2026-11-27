import { store } from "../../core/store.js";
import { createClientOptionsStore } from "./client-options-store.js";
import { showClientOptionsSaved } from "./client-options-toast.js";

const clientOptions = createClientOptionsStore({
  storage: store,
  onSave: () => showClientOptionsSaved()
});

const createDefaultActions = () => ({
  setClientOption: null,
  parseClientOptionCommand() {},
  appendOutput() {},
  scrollBuffer() {},
  refreshAutoscroll() {},
  getPreference() {
    return undefined;
  },
  setPreference() {}
});

let clientActions = createDefaultActions();
const getClientOptionsActions = () => clientActions;

function setClientOptionsActions(actions = {}) {
  clientActions = {
    ...createDefaultActions(),
    ...actions
  };
}

export { clientOptions, getClientOptionsActions, setClientOptionsActions };

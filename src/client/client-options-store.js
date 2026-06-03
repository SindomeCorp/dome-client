import { store } from "./store.js";
import {
  CLIENT_OPTION_STORAGE_PREFIX,
  buildClientOptionState,
  getClientOptionStorageKey
} from "./client-option-schema.js";

export function createClientOptionsStore({
  storage = store,
  options = buildClientOptionState(),
  prefix = CLIENT_OPTION_STORAGE_PREFIX,
  onSave = () => {}
} = {}) {
  return {
    options,
    prefix,
    storageKey(name) {
      return getClientOptionStorageKey(name, this.prefix);
    },
    get(name) {
      const option = this.options[name];
      if (!option) {
        throw new Error("invalid option name");
      }
      let state = storage.get(this.storageKey(name));
      if (state == null) {
        state = option.def;
      }
      option.state = state == "true" ? true : state == "false" ? false : state;
      return option;
    },
    save(name, value) {
      const option = this.options[name];
      if (!option) {
        throw new Error("invalid option name");
      }
      storage.put(this.storageKey(name), value);
      onSave();
    },
    buildQueryString() {
      let qs = "";
      for (const name in this.options) {
        const option = this.get(name);
        qs += qs == "" ? "" : "&";
        qs += option.param + "=" + encodeURIComponent(option.state);
      }
      return qs;
    }
  };
}

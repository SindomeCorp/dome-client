import { store } from "../../core/store.js";
import {
  CLIENT_OPTION_STORAGE_PREFIX,
  SECONDARY_PRESENTATION_OPTIONS,
  coerceOptionValue,
  buildClientOptionState,
  getClientOptionStorageKey
} from "../../../shared/client-options.js";

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
      const mainKey = SECONDARY_PRESENTATION_OPTIONS[name];
      if (mainKey && (state == null || !coerceOptionValue(option, state).valid)) {
        const main = this.get(mainKey).state;
        state = coerceOptionValue(option, main).valid ? main : option.def;
        storage.put(this.storageKey(name), state);
      }
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

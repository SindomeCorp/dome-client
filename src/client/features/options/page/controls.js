import { getPreferenceNameForOptionKey } from "../../../../shared/client-options.js";

function parseButtonValue(value) {
  if (value == "true") return true;
  if (value == "false") return false;
  return value;
}

function readOptionInputValue(input) {
  let fieldValue = input.value;
  if (input.dataset.colorHex === "true") {
    fieldValue = fieldValue.trim();
    if (!fieldValue.startsWith("#")) fieldValue = `#${fieldValue}`;
  }
  if (input.getAttribute("type") == "number") {
    fieldValue = fieldValue.indexOf(".") != -1 ? parseFloat(fieldValue) : parseInt(fieldValue);
  }
  return fieldValue;
}

function createClientOptionControlBinder({
  options,
  getActions,
  logger
}) {
  function getOptionNameFromRow(row) {
    const id = row?.getAttribute("id") || "";
    if (!id.endsWith("-option")) return null;
    const name = id.slice(0, -"-option".length);
    if (!Object.prototype.hasOwnProperty.call(options.options, name)) return null;
    return name;
  }

  function applyOptionValue(name, value) {
    const actions = getActions();
    const prefName = getPreferenceNameForOptionKey(name);
    if (prefName && actions.setClientOption) {
      return actions.setClientOption(prefName, value, { source: "ui" });
    }
    options.save(name, value);
    return { ok: true, status: "saved" };
  }

  function refreshClientOptions({ root = document } = {}) {
    root.querySelectorAll("div.client-options-page div.option-row").forEach((row) => {
      const name = getOptionNameFromRow(row);
      if (!name) return;
      const option = options.get(name);

      row.querySelectorAll("button.enabled-state, button.disabled-state").forEach((btn) => btn.classList.remove("btn-primary"));

      let active = "disabled-state";
      if (!option.ok || option.state == option.ok[0]) {
        active = "enabled-state";
      }
      const activeButton = row.querySelector("button." + active);
      if (activeButton) {
        activeButton.classList.add("btn-primary");
      }

      const select = row.querySelector("select");
      if (select) {
        select.querySelectorAll("option[selected]").forEach((opt) => opt.removeAttribute("selected"));
        const r = select.querySelector(`option[value="${option.state}"]`);
        if (r) {
          r.setAttribute("selected", true);
          select.value = option.state;
        }
      }

      const inputs = row.querySelectorAll("input");
      if (inputs.length > 0) {
        inputs.forEach((input) => {
          input.value = option.state;
        });
      }
    });
  }

  function bindOptionSelects({ root = document } = {}) {
    root.querySelectorAll("div.client-options-page div.option-row select").forEach((self) => {
      const id = getOptionNameFromRow(self.parentElement);
      if (!id) return;
      self.addEventListener("change", () => {
        applyOptionValue(id, self.value);
        getActions().scrollBuffer();
      });
    });
  }

  function bindOptionButtons({ root = document } = {}) {
    root.querySelectorAll("div.client-options-page div.option-row button.enabled-state, div.client-options-page div.option-row button.disabled-state").forEach((self) => {
      self.addEventListener("click", () => {
        const btn = self;
        const val = parseButtonValue(btn.dataset.val);
        const row = btn.closest("div.option-row");
        const name = getOptionNameFromRow(row);
        if (!name) return;
        const otherBtn = row.querySelector(btn.classList.contains("enabled-state") ? "button.disabled-state" : "button.enabled-state");

        if (btn.classList.contains("btn-primary")) {
          btn.classList.remove("btn-primary");
          if (otherBtn) {
            otherBtn.classList.add("btn-primary");
          }
        } else {
          if (otherBtn) {
            otherBtn.classList.remove("btn-primary");
          }
          btn.classList.add("btn-primary");
        }
        applyOptionValue(name, val);
        getActions().scrollBuffer();
      });
    });
  }

  function syncColorInputs(row, name) {
    const updated = getActions().getPreference(getPreferenceNameForOptionKey(name));
    if (typeof updated === "string") {
      row.querySelectorAll("input").forEach((input) => {
        input.value = updated;
      });
    }
  }

  function bindOptionInputs({ root = document } = {}) {
    root.querySelectorAll("div.client-options-page div.option-row input").forEach((self) => {
      if (self.getAttribute("type") === "file") return;
      const row = self.closest("div.option-row");
      const name = getOptionNameFromRow(row);
      if (!name) return;

      self.addEventListener("change", () => {
        const fieldValue = readOptionInputValue(self);
        logger.debug("" + typeof(fieldValue) + ": " + fieldValue);
        applyOptionValue(name, fieldValue);
        if (getPreferenceNameForOptionKey(name) && (self.getAttribute("type") === "color" || self.dataset.colorHex === "true")) {
          syncColorInputs(row, name);
        }
        getActions().scrollBuffer();
      });
    });
  }

  return {
    applyOptionValue,
    bindOptionButtons,
    bindOptionInputs,
    bindOptionSelects,
    getOptionNameFromRow,
    refreshClientOptions
  };
}

export {
  createClientOptionControlBinder
};

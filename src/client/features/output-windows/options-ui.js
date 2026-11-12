import { validateOutputRule } from "../../../shared/output-windows.js";

export function setupOutputOptions(manager) {
  const { doc, config } = manager;
  const layout = doc.querySelector("#output-layout");
  if (!layout) return { refresh() {} };
  let editing = null;
  const form = doc.querySelector("#output-rule-form");
  const name = doc.querySelector("#output-rule-name");
  const pattern = doc.querySelector("#output-rule-pattern");
  const ignoreCase = doc.querySelector("#output-rule-case");
  const error = doc.querySelector("#output-rule-error");
  const result = doc.querySelector("#output-rule-test-result");
  const cancel = doc.querySelector("#output-rule-cancel");
  function reset() {
    editing = null;
    form.reset();
    cancel.classList.add("hide");
    doc.querySelector("#output-rule-save").textContent = "Add filter";
    result.textContent = "";
    error.textContent = "";
  }
  function read() {
    const id = editing || "custom-" + (manager.win.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2));
    const checked = validateOutputRule({ id, name: name.value, pattern: pattern.value, ignoreCase: ignoreCase.checked });
    error.textContent = checked.error || "";
    return checked.rule;
  }
  function renderRule(rule, custom) {
    const row = doc.createElement("div");
    row.className = "output-rule";
    const label = doc.createElement("label");
    const checkbox = doc.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = manager.settings.selected.includes(rule.id);
    checkbox.disabled = custom && !config.customRegexEnabled;
    checkbox.addEventListener("change", () => {
      const selected = manager.settings.selected.filter((id) => id !== rule.id);
      if (checkbox.checked) selected.push(rule.id);
      manager.updateSettings({ selected });
    });
    label.title = rule.pattern;
    label.append(checkbox, doc.createTextNode(rule.name));
    if (manager.runner.suspended.has(rule.id)) label.append(doc.createTextNode(" (suspended; edit or toggle to retry)"));
    row.append(label);
    if (custom && config.customRegexEnabled) {
      const edit = doc.createElement("button");
      edit.type = "button";
      edit.className = "btn btn-xs";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", "Edit " + rule.name);
      edit.addEventListener("click", () => {
        editing = rule.id;
        name.value = rule.name;
        pattern.value = rule.pattern;
        ignoreCase.checked = rule.ignoreCase;
        cancel.classList.remove("hide");
        doc.querySelector("#output-rule-save").textContent = "Save filter";
        name.focus();
      });
      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-xs";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Delete " + rule.name);
      remove.addEventListener("click", () => {
        if (!manager.win.confirm("Delete the custom filter “" + rule.name + "”?")) return;
        manager.updateSettings({
          custom: manager.settings.custom.filter((item) => item.id !== rule.id),
          selected: manager.settings.selected.filter((id) => id !== rule.id)
        });
        if (editing === rule.id) reset();
      });
      row.append(edit, remove);
    }
    if (custom && !config.customRegexEnabled) row.append(doc.createTextNode(" (custom filters disabled by this game)"));
    return row;
  }
  function refresh() {
    layout.value = manager.isSplitOpen() ? manager.settings.position : "single";
    doc.querySelector("#output-presets").replaceChildren(...config.presets.map((rule) => renderRule(rule, false)));
    doc.querySelector("#output-custom-rules").replaceChildren(...manager.settings.custom.map((rule) => renderRule(rule, true)));
    form.classList.toggle("hide", !config.customRegexEnabled);
  }
  layout.addEventListener("change", () => {
    manager.updateSettings(layout.value === "single" ? { open: false } : { open: true, position: layout.value });
  });
  cancel.addEventListener("click", reset);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!config.customRegexEnabled) return;
    const rule = read();
    if (!rule) return;
    const custom = manager.settings.custom.filter((item) => item.id !== rule.id);
    custom.push(rule);
    manager.updateSettings({ custom });
    reset();
  });
  doc.querySelector("#output-rule-test").addEventListener("click", async () => {
    if (!config.customRegexEnabled) return;
    const rule = read();
    if (!rule) return;
    const lines = doc.querySelector("#output-rule-sample").value.replace(/\r\n?/g, "\n").split("\n");
    result.textContent = "Testing…";
    const matches = await manager.runner.match(lines, [rule]);
    result.textContent = lines.map((line, index) => (matches[index] ? "✓ " : "– ") + (index + 1) + ": " + line).join("\n");
  });
  refresh();
  return { refresh };
}

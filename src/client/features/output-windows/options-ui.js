import { validateOutputRule } from "../../../shared/output-windows.js";

export function setupOutputOptions(manager) {
  const { doc, config } = manager;
  const layout = doc.querySelector("#output-layout");
  if (!layout) return { refresh() {} };
  let editing = null;
  let activeGroup = "player";
  const groups = ["player", "gm", "coder", "custom"];
  const groupLabels = { player: "Player Filters", gm: "GM Filters", coder: "Coder Filters", custom: "Custom Filters" };
  const groupButtons = [...doc.querySelectorAll("[data-filter-group]")];
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const sortRules = (rules) => [...rules].sort((a, b) => collator.compare(a.name, b.name));
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
    checkbox.dataset.outputRuleId = rule.id;
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
    const focusedRule = doc.activeElement?.dataset.outputRuleId;
    layout.value = manager.isSplitOpen() ? manager.settings.position : "single";
    const selected = new Set(manager.settings.selected);
    const rulesByGroup = {
      player: config.presets.filter((rule) => (rule.group || "player") === "player"),
      gm: config.presets.filter((rule) => rule.group === "gm" || rule.group === "admin"),
      coder: config.presets.filter((rule) => rule.group === "coder"),
      custom: manager.settings.custom
    };
    for (const button of groupButtons) {
      const group = button.dataset.filterGroup;
      const rules = rulesByGroup[group];
      const count = rules.filter((rule) => selected.has(rule.id)).length;
      button.textContent = groupLabels[group] + " [" + count + "/" + rules.length + "]";
      button.setAttribute("aria-selected", String(group === activeGroup));
      button.classList.toggle("btn-primary", group === activeGroup);
      button.tabIndex = group === activeGroup ? 0 : -1;
      if (!button.id) button.id = "output-filter-tab-" + group;
    }
    const presets = doc.querySelector("#output-presets");
    presets.classList.toggle("hide", activeGroup === "custom");
    presets.setAttribute("aria-labelledby", "output-filter-tab-" + activeGroup);
    const visibleRules = activeGroup === "custom" ? [] : rulesByGroup[activeGroup];
    presets.replaceChildren(...sortRules(visibleRules).map((rule) => renderRule(rule, false)));
    const customPanel = doc.querySelector("#output-custom-panel");
    customPanel.classList.toggle("hide", activeGroup !== "custom");
    customPanel.setAttribute("aria-labelledby", "output-filter-tab-custom");
    doc.querySelector("#output-custom-rules").replaceChildren(...sortRules(manager.settings.custom).map((rule) => renderRule(rule, true)));
    form.classList.toggle("hide", !config.customRegexEnabled);
    if (focusedRule) {
      [...doc.querySelectorAll("[data-output-rule-id]")].find((element) => element.dataset.outputRuleId === focusedRule)?.focus({ preventScroll: true });
    }
  }
  for (const button of groupButtons) {
    button.addEventListener("click", () => { activeGroup = button.dataset.filterGroup; refresh(); });
    button.addEventListener("keydown", (event) => {
      const index = groups.indexOf(activeGroup);
      const next = event.key === "ArrowRight" ? (index + 1) % groups.length : event.key === "ArrowLeft" ? (index + groups.length - 1) % groups.length
        : event.key === "Home" ? 0 : event.key === "End" ? groups.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      groupButtons[next].click();
      groupButtons[next].focus();
    });
  }
  doc.querySelector("#client-options-tab-output")?.addEventListener("click", () => { activeGroup = "player"; refresh(); });
  doc.querySelector("#button-client-options")?.addEventListener("click", () => {
    if (doc.querySelector("#client-options-overlay")?.classList.contains("hide")) { activeGroup = "player"; refresh(); }
  });
  layout.addEventListener("change", () => {
    if (layout.value === "single" && manager.isSplitOpen() && manager.closeSplit) {
      manager.closeSplit();
      refresh();
      return;
    }
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

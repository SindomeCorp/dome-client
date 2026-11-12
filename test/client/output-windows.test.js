import test from "node:test";
import assert from "node:assert/strict";
import { createOutputApp } from "../../test-support/output-app.js";
import { recordText } from "../../src/client/features/output-windows/history.js";
import { copySnapshot, exportSnapshot } from "../../src/client/features/output-windows/history-tools.js";
import { clearClientBuffer } from "../../src/client/features/terminal/button-workflows.js";
import { buildExportPayload, importClientOptionsJson } from "../../src/client/features/options/client-options-import-export-ui.js";
import { outputWindowDefaults } from "../../src/shared/output-windows.js";

test("splits route future output and closing restores chronology; reopening starts empty", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  await feed("before\n[-][Team-Chat] before selection\n");
  manager.updateSettings({ selected: ["team-chat"] });
  await feed("[-][Team-Chat] while closed\n");
  assert.equal(manager.views.secondary.index.length, 0);
  manager.updateSettings({ open: true });
  await feed("main one\n\u001b[31m[-][Team-Chat] moved\u001b[0m\nmain two\n");
  assert.equal(manager.views.main.index.length, 5);
  assert.equal(manager.views.secondary.index.length, 1);
  assert.equal(recordText(manager.views.secondary.index.at(0)), "[-][Team-Chat] moved");
  manager.updateSettings({ selected: [] });
  await feed("[-][Team-Chat] stays in main\n");
  assert.equal(manager.views.secondary.index.length, 1);
  manager.views.main.setPaused(true);
  manager.updateSettings({ open: false });
  await manager.idle();
  assert.equal(manager.views.secondary.index.length, 0);
  assert.equal(manager.views.main.unread, 0);
  assert.deepEqual(Array.from({ length: manager.views.main.index.length }, (_, i) => recordText(manager.views.main.index.at(i))), [
    "before", "[-][Team-Chat] before selection", "[-][Team-Chat] while closed", "main one",
    "[-][Team-Chat] moved", "main two", "[-][Team-Chat] stays in main"
  ]);
  manager.updateSettings({ open: true });
  await manager.idle();
  assert.equal(manager.views.secondary.index.length, 0);
});

test("global and custom flags enforce policy without deleting saved rules", async (t) => {
  const stored = { ...outputWindowDefaults(), open: true, selected: ["custom-one"], custom: [{ id: "custom-one", name: "One", pattern: "chat" }] };
  const { manager, doc, feed } = await createOutputApp(t, { config: { enabled: false, customRegexEnabled: false }, stored });
  await feed("chat\n");
  assert.equal(manager.views.main.index.length, 1);
  assert.equal(manager.settings.custom.length, 1);
  assert.equal(manager.isSplitOpen(), false);
  assert.equal(doc.querySelector("#button-output-split").classList.contains("hide"), true);
  doc.querySelector("#button-output-find").click();
  assert.equal(doc.querySelector("#output-find").classList.contains("hide"), false);
  const imported = manager.importSettings({
    ...outputWindowDefaults(), custom: [{ id: "custom-two", name: "Two", pattern: "other" }], selected: ["custom-two"]
  });
  assert.equal(imported.skipped, 1);
  assert.equal(manager.settings.custom[0].id, "custom-one");
  assert.deepEqual(manager.settings.selected, ["custom-one"]);
});

test("nowrap blocks stay in main, share pruning, and local echo joins the unified log", async (t) => {
  const { manager, client, feed } = await createOutputApp(t);
  client.preferences.sdwcNowrapBlocks = true;
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  await feed("#$# SDWC-START-NOWRAP\n[-][Team-Chat] table\nsecond row\n#$# SDWC-END-NOWRAP\n[-][Team-Chat] routed\n");
  manager.appendLocal(">look\n", { echo: true });
  await manager.idle();
  assert.equal(manager.views.main.index.length, 3);
  assert.equal(manager.views.secondary.index.length, 1);
  const html = (await exportSnapshot(await manager.snapshot(), { client })).join("");
  assert.ok(html.indexOf("table") < html.indexOf("routed"));
  assert.ok(html.indexOf("routed") < html.indexOf("&gt;look"));
  client.preferences.performanceBuffer = 2;
  manager.prune();
  await manager.idle();
  assert.equal(manager.history.length, 2);
  clearClientBuffer(client);
  assert.equal(manager.history.length, 0);
  assert.equal(manager.settings.open, true);
  await feed("after clear\n");
  assert.equal(manager.views.main.index.length, 1);
  assert.equal(recordText(manager.views.main.index.at(0)), "after clear");
});

test("mounted rows stay bounded; offscreen history remains copyable", async (t) => {
  const { manager, doc, feed } = await createOutputApp(t);
  await feed(Array.from({ length: 20_000 }, (_, i) => "line " + i).join("\n") + "\n");
  assert.equal(manager.history.length, 20_000);
  assert.ok(doc.querySelectorAll("[data-output-id]").length < 150);
  manager.views.main.jump(100);
  manager.views.main.render();
  assert.ok(manager.views.main.mounted.has(100));
  assert.ok(doc.querySelectorAll("[data-output-id]").length < 150);
  const copied = await copySnapshot(await manager.snapshot(), { start: 100, end: 102 });
  assert.equal(copied, "line 99\nline 100\nline 101");
});

test("pause, unread, row navigation and keyboard resizing are independent", async (t) => {
  const { manager, doc, win, feed } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["team-chat"], position: "bottom" });
  await feed("main\n[-][Team-Chat] chat\n");
  doc.querySelector("[data-output-pause=secondary]").click();
  await feed("main two\n[-][Team-Chat] chat two\n");
  assert.equal(manager.views.secondary.paused, true);
  assert.equal(manager.views.main.paused, false);
  assert.equal(manager.views.secondary.unread, 1);
  assert.match(doc.querySelector("[data-output-unread=secondary]").textContent, /1 unread/);
  manager.togglePause();
  assert.equal(manager.views.secondary.paused, false);
  const divider = doc.querySelector("#output-divider");
  divider.dispatchEvent(new win.KeyboardEvent("keydown", { key: "End", bubbles: true }));
  assert.equal(manager.settings.secondarySize, 85);
  divider.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
  assert.equal(manager.settings.secondarySize, 15);
  divider.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  assert.equal(manager.settings.secondarySize, 17);
  manager.views.main.element.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  assert.equal(manager.views.main.paused, true);
  assert.ok(manager.activeRows.main);
  doc.querySelector("#button-output-configure").click();
  assert.equal(manager.client.clientOptionsOverlay.classList.contains("hide"), false);
});

test("custom rule UI validates, tests, edits and confirms removal", async (t) => {
  const { manager, doc, win } = await createOutputApp(t);
  const name = doc.querySelector("#output-rule-name");
  const pattern = doc.querySelector("#output-rule-pattern");
  name.value = "Messages";
  pattern.value = "[";
  doc.querySelector("#output-rule-form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  assert.equal(manager.settings.custom.length, 0);
  assert.ok(doc.querySelector("#output-rule-error").textContent);
  pattern.value = "^hello";
  doc.querySelector("#output-rule-case").checked = true;
  doc.querySelector("#output-rule-sample").value = "HELLO there\nno match";
  doc.querySelector("#output-rule-test").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(doc.querySelector("#output-rule-test-result").textContent, /✓ 1: HELLO/);
  doc.querySelector("#output-rule-form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  assert.equal(manager.settings.custom.length, 1);
  assert.equal(manager.settings.selected.length, 0);
  doc.querySelector("#output-custom-rules input").click();
  assert.equal(manager.settings.selected.length, 1);
  doc.querySelector("#output-custom-rules button").click();
  assert.equal(name.value, "Messages");
  name.value = "Renamed";
  doc.querySelector("#output-rule-form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  assert.equal(manager.settings.custom[0].name, "Renamed");
  win.confirm = () => false;
  doc.querySelector("[aria-label='Delete Renamed']").click();
  assert.equal(manager.settings.custom.length, 1);
  win.confirm = () => true;
  doc.querySelector("[aria-label='Delete Renamed']").click();
  assert.equal(manager.settings.custom.length, 0);
  assert.equal(manager.settings.selected.length, 0);
});

test("preference exports round-trip output windows and older files preserve them", async (t) => {
  const { manager } = await createOutputApp(t);
  manager.updateSettings({ position: "top", selected: ["ooc-chat"] });
  const options = { options: {}, get() {} };
  const actions = {
    getOutputWindows: () => manager.settings, importOutputWindows: (value) => manager.importSettings(value),
    appendOutput() {}, scrollBuffer() {}
  };
  const payload = buildExportPayload({ options, actions });
  assert.equal(payload.outputWindows.position, "top");
  manager.resetSettings();
  await importClientOptionsJson({ file: { text: async () => JSON.stringify(payload) }, options, actions, applyOptionValue() {}, refreshClientOptions() {}, showToast() {} });
  assert.equal(manager.settings.position, "top");
  await importClientOptionsJson({ file: { text: async () => JSON.stringify({ preferences: {} }) }, options, actions, applyOptionValue() {}, refreshClientOptions() {}, showToast() {} });
  assert.equal(manager.settings.position, "top");
  assert.equal(manager.importSettings({ version: 100 }).valid, false);
  assert.equal(manager.settings.position, "top");
});

test("media mounts once and remounting historical rows does not retrigger alerts", async (t) => {
  const { manager, client, doc, feed } = await createOutputApp(t);
  let alerts = 0;
  client.alert = { active: true, pattern: /picture/, tone: { play: () => alerts++ } };
  client.windowAlert = () => {};
  client.preferences.imagePreview = true;
  await feed("picture https://example.com/picture.png\n");
  assert.equal(alerts, 1);
  assert.equal(doc.querySelectorAll("img").length, 1);
  const control = doc.querySelector("[data-output-media]");
  control.click();
  assert.equal(doc.querySelectorAll("img").length, 0);
  control.click();
  assert.equal(doc.querySelectorAll("img").length, 1);
  await feed(Array.from({ length: 500 }, (_, i) => "later " + i).join("\n") + "\n");
  assert.equal(doc.querySelectorAll("img").length, 0);
  manager.views.main.jump(1);
  manager.views.main.render();
  assert.equal(doc.querySelectorAll("img").length, 0);
  assert.equal(alerts, 1);
});

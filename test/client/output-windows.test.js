import test from "node:test";
import assert from "node:assert/strict";
import { createOutputApp } from "../../test-support/output-app.js";
import { recordText } from "../../src/client/features/output-windows/history.js";
import { exportSnapshot } from "../../src/client/features/output-windows/history-tools.js";
import { clearClientBuffer } from "../../src/client/features/terminal/button-workflows.js";
import { buildExportPayload, importClientOptionsJson } from "../../src/client/features/options/client-options-import-export-ui.js";
import { copyOutputSelection } from "../../src/client/features/output-windows/selection.js";
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

test("nowrap blocks route intact, share pruning, and local echo joins the unified log", async (t) => {
  const { manager, client, feed } = await createOutputApp(t);
  client.preferences.sdwcNowrapBlocks = true;
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  await feed("#$# SDWC-START-NOWRAP\n[-][Team-Chat] table\nsecond row\n#$# SDWC-END-NOWRAP\n[-][Team-Chat] routed\n");
  manager.appendLocal(">look\n", { echo: true });
  await manager.idle();
  assert.equal(manager.views.main.index.length, 1);
  assert.equal(manager.views.secondary.index.length, 3);
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

test("pruning an arriving nowrap block across local echo never retains its suffix", async (t) => {
  const { manager, client, feed } = await createOutputApp(t);
  client.preferences.performanceBuffer = 4;
  await feed("#$# SDWC-START-NOWRAP\nmap one\nmap two\nmap three\n");
  manager.appendLocal(">look\n", { echo: true });
  await manager.idle();
  await feed("map four\nmap five\nmap six\n#$# SDWC-END-NOWRAP\nafter\n");
  assert.deepEqual([...manager.history.snapshot()].map(recordText), ["after"]);
  assert.equal(manager.views.main.index.length, 1);
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
  const copied = await copyOutputSelection(await manager.snapshot(undefined, 100, 102), { start: { id: 100, offset: 0 }, end: { id: 102, offset: 8 } });
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
  assert.ok(manager.views.main.mounted.has(Number(doc.activeElement.dataset.outputId)));
  doc.querySelector("#button-output-configure").click();
  assert.equal(manager.client.clientOptionsOverlay.classList.contains("hide"), false);
});

test("custom rule UI validates, tests, edits and confirms removal", async (t) => {
  const { manager, doc, win } = await createOutputApp(t);
  doc.querySelector("[data-filter-group=custom]").click();
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

test("slow routing cannot retain a pruned backlog or delay current output behind discarded batches", async (t) => {
  const sent = [];
  let worker;
  const { manager, client } = await createOutputApp(t, { workerFactory: () => worker = {
    addEventListener(name, listener) { this[name] = listener; },
    postMessage(message) { sent.push(message); },
    terminate() {}
  } });
  client.preferences.performanceBuffer = 10;
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  client.parseSocketData(Array.from({ length: 50_000 }, (_, i) => "[-][Team-Chat] queued " + i).join("\n") + "\n");
  await manager.inputQueue.idle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(manager.history.length, 10);
  assert.ok(manager.routing.size <= 2);
  assert.ok(manager.pending.size <= 2);
  assert.ok(manager.runner.pendingLines < 300);
  assert.equal(sent.length, 1, "obsolete queued work was never sent to the worker");
  worker.message({ data: { id: sent[0].id, matches: sent[0].lines.map(() => true) } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(sent.length, 2, "the next batch is current output, not an old backlog");
  worker.message({ data: { id: sent[1].id, matches: sent[1].lines.map(() => true) } });
  await manager.idle();
  assert.equal(manager.views.secondary.index.length, 10);
  assert.equal(manager.views.main.index.length, 0);
  assert.equal(manager.pending.size, 0);
  manager.updateSettings({ open: false });
  await manager.idle();
  const html = (await exportSnapshot(await manager.snapshot(), { client })).join("");
  assert.equal(manager.views.main.index.length, 10);
  assert.equal((html.match(/queued 49999/g) || []).length, 1);
  assert.ok(html.indexOf("queued 49990") < html.indexOf("queued 49999"));
});

test("manual scrollback survives repaints and measurements until new output with auto-pause disabled", async (t) => {
  const { manager, client, feed } = await createOutputApp(t);
  await feed(Array.from({ length: 2000 }, (_, i) => "row " + i).join("\n") + "\n");
  manager.updateSettings({ open: true });
  await manager.idle();
  const view = manager.views.main;
  Object.defineProperties(view.element, {
    clientHeight: { value: 400 },
    scrollHeight: { get: () => view.index.total }
  });
  assert.equal(client.preferences.scrollUpToPause, false);
  view.programmatic = false;
  view.element.scrollTop = 1000;
  view.onScroll();
  view.render();
  assert.equal(view.element.scrollTop, 1000);
  assert.equal(view.paused, false);
  const anchor = view.anchor.id;
  view.index.measure(0, 80);
  view.render();
  assert.equal(view.anchor.id, anchor);
  assert.ok(view.element.scrollTop < 2000);
  manager.updateSettings({ open: false });
  await manager.idle();
  view.render();
  assert.equal(view.following, false);
  assert.equal(view.anchor.id, anchor);
  assert.ok(view.element.scrollTop < 2000);
  await feed("new output\n");
  assert.equal(view.following, true);
  assert.ok(view.element.scrollTop > 2000);
  view.setPaused(true);
  const paused = view.element.scrollTop;
  await feed("paused output\n");
  assert.equal(view.element.scrollTop, paused);
});

test("clearing resets spacer heights and the expected native position before new output", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  await feed(Array.from({ length: 500 }, (_, i) => "row " + i).join("\n") + "\n");
  const view = manager.views.main;
  assert.ok(parseFloat(view.top.style.height) > 0);
  manager.clear();
  assert.equal(view.top.style.height, "0px");
  assert.equal(view.bottom.style.height, "0px");
  assert.equal(view.element.scrollTop, 0);
  assert.equal(view.expectedScrollTop, 0);
  view.onScroll();
  assert.equal(view.following, true, "the browser clamp after clearing must not leave following mode");
  manager.updateSettings({ open: true, position: "left", selected: ["team-chat"] });
  await feed("new main\n[-][Team-Chat] new secondary\n");
  for (const panel of Object.values(manager.views)) assert.equal(panel.following, true);
});

for (const mode of ["single", "split", "disabled"]) {
  for (const autoPause of [false, true]) {
    test("small upward scrolls leave the tail and downward scrolling resumes: " + mode + ", auto-pause " + autoPause, async (t) => {
      const { manager, client, feed } = await createOutputApp(t, { config: { enabled: mode !== "disabled" } });
      client.preferences.scrollUpToPause = autoPause;
      manager.updateSettings({ open: mode === "split", selected: ["team-chat"] });
      await feed(Array.from({ length: 200 }, (_, i) => "main " + i + "\n[-][Team-Chat] chat " + i).join("\n") + "\n");
      for (const name of mode === "split" ? ["main", "secondary"] : ["main"]) {
        const view = manager.views[name];
        Object.defineProperties(view.element, {
          clientHeight: { value: 400 },
          scrollHeight: { get: () => view.index.total + 25 }
        });
        view.element.style.padding = "10px 0 15px";
        view.setPaused(false);
        view.render();
        const before = view.element.scrollTop;
        // This event is generated by our own render, not by a user gesture.
        view.onScroll();
        assert.equal(view.following, true);
        view.index.measure(view.index.length - 1, 500);
        view.render();
        view.index.measure(view.index.length - 1, 18);
        view.element.scrollTop = view.element.scrollHeight - view.element.clientHeight;
        view.onScroll();
        assert.equal(view.following, true, "a smaller scroll range clamps the viewport without user intent");
        assert.equal(view.paused, false);
        view.render();
        const tail = view.element.scrollTop;
        view.element.scrollTop -= 0.25;
        view.onScroll();
        view.render();
        assert.equal(view.following, false, "subpixel upward movement also leaves the tail");
        assert.equal(view.element.scrollTop, tail - 0.25);
        view.element.scrollTop += 0.25;
        view.onScroll();
        view.render();
        assert.equal(view.following, true);
        for (let i = 1; i <= 3; i++) {
          view.element.scrollTop -= 5;
          view.onScroll();
          view.render();
          assert.equal(view.element.scrollTop, before - i * 5);
          assert.equal(view.following, false);
          assert.equal(view.paused, autoPause);
        }
        // Track direction even when two native scroll events precede a frame.
        view.element.scrollTop -= 5;
        view.onScroll();
        view.element.scrollTop += 2;
        view.onScroll();
        view.render();
        assert.equal(view.following, true, "downward movement within 24px resumes following");
        assert.equal(view.paused, false);
        assert.equal(view.element.scrollTop, before);
        view.element.scrollTop -= 10;
        view.onScroll();
        view.render();
        await feed("new main\n[-][Team-Chat] new chat\n");
        assert.equal(view.paused, autoPause);
        assert.equal(view.following, !autoPause, "new output respects the existing automatic-pause preference");
        if (autoPause) {
          assert.equal(view.element.scrollTop, before - 10);
          assert.ok(view.unread > 0);
        }
      }
    });
  }
}

test("closing through either split button or layout options requires confirmation", async (t) => {
  const { manager, win, doc, feed } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  await feed("main\n[-][Team-Chat] retained\n");
  let prompts = 0;
  win.confirm = () => { prompts++; return false; };
  for (const selector of ["#button-output-close", "#button-output-split"]) {
    doc.querySelector(selector).click();
    assert.equal(manager.isSplitOpen(), true);
    assert.equal(manager.views.secondary.index.length, 1);
  }
  const layout = doc.querySelector("#output-layout");
  layout.value = "single";
  layout.dispatchEvent(new win.Event("change"));
  assert.equal(layout.value, "right");
  assert.equal(prompts, 3);
  win.confirm = () => true;
  doc.querySelector("#button-output-close").click();
  await manager.idle();
  assert.equal(manager.isSplitOpen(), false);
  assert.equal(manager.views.main.index.length, 2);
  assert.deepEqual([...doc.querySelectorAll(".client-options-tab")].map((tab) => tab.textContent), ["General", "Presentation", "Local Editor", "Output Windows", "Import/Export"]);
  assert.equal(doc.querySelector("#output-main-panel header"), null);
});

test("toolbar pause always controls main and secondary uses the same styled pause control", async (t) => {
  const { manager, doc, client } = await createOutputApp(t);
  manager.updateSettings({ open: true });
  const secondary = doc.querySelector("[data-output-pause=secondary]");
  secondary.click();
  assert.equal(manager.views.secondary.paused, true);
  assert.equal(client.scrollButton.classList.contains("btn-primary"), true);
  client.onToggleAutoScroll({ type: "click" });
  assert.equal(manager.views.main.paused, true);
  assert.equal(manager.views.secondary.paused, true);
  assert.equal(client.scrollButton.classList.contains("btn-danger"), true);
  assert.equal(secondary.classList.contains("btn-danger"), true);
  assert.equal(secondary.textContent, client.scrollButton.textContent);
  assert.ok(secondary.querySelector("svg"));
  manager.activePanel = "secondary";
  client.onToggleAutoScroll();
  assert.equal(manager.views.secondary.paused, false, "keyboard shortcut still follows the active pane");
  assert.equal(manager.views.main.paused, true);
});

test("rendered text height excludes pane padding when following the newest output", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  await feed(Array.from({ length: 100 }, (_, i) => "row " + i).join("\n") + "\n");
  const view = manager.views.main;
  Object.defineProperty(view.element, "clientHeight", { value: 400 });
  view.element.style.padding = "10px 0 15px";
  view.render();
  assert.equal(view.viewportHeight(), 375);
  assert.equal(view.element.scrollTop, view.index.total - 375);
});

test("selected media endpoints remain selectable but release previews outside the viewport", async (t) => {
  const { manager, client, doc, feed } = await createOutputApp(t);
  client.preferences.imagePreview = true;
  await feed("https://example.com/selected.mp4\n");
  const view = manager.views.main;
  const row = view.mounted.get(1);
  assert.ok(row.querySelector("video"));
  doc.getSelection().selectAllChildren(row.querySelector("a"));
  await feed(Array.from({ length: 2000 }, (_, i) => "later " + i).join("\n") + "\n");
  view.setPaused(true);
  view.element.scrollTop = view.index.total - 400;
  view.onScroll();
  view.render();
  assert.ok(row.isConnected);
  assert.equal(row.querySelector("video"), null);
  assert.equal(manager.history.get(1).collapsed, true);
  assert.ok(view.mounted.size < 150);
});

test("puppet presets route ANSI-stripped line prefixes once even when both match", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["puppet-1", "puppet-all"] });
  await feed("\u001b[32m[p1 first\u001b[0m\n[p2 second\n[p0 zero\nbefore [p1 stays main\n[P1 upper stays main\n[px stays main\n");
  assert.equal(manager.views.secondary.index.length, 3);
  assert.equal(manager.views.main.index.length, 3);
  assert.deepEqual(Array.from({ length: 3 }, (_, i) => recordText(manager.views.secondary.index.at(i))), ["[p1 first", "[p2 second", "[p0 zero"]);
});

test("filter groups keep hidden selections active and display selected/total counts", async (t) => {
  const { manager, doc, win, feed } = await createOutputApp(t);
  const player = doc.querySelector("[data-filter-group=player]");
  const admin = doc.querySelector("[data-filter-group=gm]");
  const custom = doc.querySelector("[data-filter-group=custom]");
  assert.equal(player.getAttribute("aria-selected"), "true");
  assert.equal(player.textContent, "Player Filters [0/13]");
  assert.equal(admin.textContent, "GM Filters [0/33]");
  assert.equal(custom.textContent, "Custom Filters [0/0]");
  const checkbox = (id) => [...doc.querySelectorAll("[data-output-rule-id]")].find((element) => element.dataset.outputRuleId === id);
  assert.equal(checkbox("team-chat"), undefined);
  checkbox("ooc-chat").click();
  admin.click();
  checkbox("team-chat").click();
  assert.equal(player.textContent, "Player Filters [1/13]");
  assert.equal(admin.textContent, "GM Filters [1/33]");
  custom.click();
  doc.querySelector("#output-rule-name").value = "Custom message";
  doc.querySelector("#output-rule-pattern").value = "^custom";
  doc.querySelector("#output-rule-form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  assert.equal(custom.textContent, "Custom Filters [0/1]");
  const id = manager.settings.custom[0].id;
  assert.equal(checkbox(id).checked, false);
  checkbox(id).click();
  assert.equal(custom.textContent, "Custom Filters [1/1]");
  player.click();
  assert.equal(checkbox("ooc-chat").checked, true);
  manager.updateSettings({ open: true });
  await feed("[-][OOC-Chat] player message\n[-][Team-Chat] admin message\ncustom message\nordinary\n");
  assert.equal(manager.views.secondary.index.length, 3);
  assert.equal(manager.views.main.index.length, 1);
  admin.click();
  admin.dispatchEvent(new win.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
  assert.equal(custom.getAttribute("aria-selected"), "true");
  doc.querySelector("#client-options-tab-output").click();
  assert.equal(player.getAttribute("aria-selected"), "true");
  assert.equal(manager.settings.selected.length, 3);
  assert.equal(custom.textContent, "Custom Filters [1/1]");
});

test("double-click pause and resume in either pane return focus to the existing input command", async (t) => {
  const { manager, doc, win, client } = await createOutputApp(t);
  manager.updateSettings({ open: true });
  client.preferences.autoScroll = "dbl";
  client.inputReader.value = "look at painting";
  for (const view of Object.values(manager.views)) {
    for (const paused of [true, false]) {
      view.element.focus();
      const event = new win.MouseEvent("dblclick", { bubbles: true, cancelable: true });
      view.element.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
      assert.equal(view.paused, paused);
      assert.equal(doc.activeElement, client.inputReader);
      assert.equal(client.inputReader.value, "look at painting");
    }
  }
});

test("empty secondary uses its scroll surface for help and pause state before output arrives", async (t) => {
  const { manager, doc, win, feed } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["ooc-chat"] });
  const secondary = manager.views.secondary;
  const help = doc.querySelector("#output-secondary-help");
  assert.equal(help.parentElement, secondary.element);
  assert.equal(help.querySelector("p").textContent, "Waiting for matching output.");
  const pause = doc.querySelector("[data-output-pause=secondary]");
  assert.ok(pause.querySelector("svg"));
  pause.click();
  assert.equal(secondary.element.classList.contains("scroll-disabled"), true);
  assert.equal(pause.getAttribute("aria-label"), "Resume secondary scrolling");
  const pageDown = new win.KeyboardEvent("keydown", { key: "PageDown", cancelable: true });
  secondary.onKey(pageDown);
  assert.equal(pageDown.defaultPrevented, false);
  await feed("[-][OOC-Chat] first matching line\n");
  assert.equal(secondary.paused, true);
  assert.equal(help.classList.contains("hide"), true);
  assert.equal(secondary.element.classList.contains("scroll-disabled"), true);
  assert.equal(secondary.unread, 1);
  manager.clear();
  secondary.render();
  assert.equal(help.parentElement, secondary.element);
  assert.equal(help.classList.contains("hide"), false);
});

test("Coder Filters owns Debug Info and saved selections survive the GM rename", async (t) => {
  const { manager, doc } = await createOutputApp(t);
  manager.updateSettings({ selected: ["debug-info", "team-chat"] });
  const gm = doc.querySelector("[data-filter-group=gm]");
  const coder = doc.querySelector("[data-filter-group=coder]");
  assert.equal(gm.textContent, "GM Filters [1/33]");
  assert.equal(coder.textContent, "Coder Filters [1/6]");
  gm.click();
  assert.equal(doc.querySelector("[data-output-rule-id=debug-info]"), null);
  coder.click();
  assert.equal(doc.querySelector("[data-output-rule-id=debug-info]").checked, true);
  assert.deepEqual(manager.settings.selected, ["debug-info", "team-chat"]);
});

test("new GM channels and coder tracebacks route once with All Channels selected", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  const names = { "login-watcher": "Login-Watcher", "grid-info": "Grid-Info", "sic-pm": "SIC-PM", "sic-enc": "SIC-ENC", "local-ooc": "Local-OOC", "trace-backs": "Trace-Backs" };
  manager.updateSettings({ open: true, selected: ["all-channels", "sic", "grid-output", ...Object.keys(names)] });
  await feed(Object.values(names).map((name) => "[-][" + name + "] sample").join("\n") + "\n|C| SIC message\n[g] grid output\nnormal main output\n");
  assert.equal(manager.views.secondary.index.length, 8);
  assert.equal(manager.views.main.index.length, 1);
  assert.equal(manager.history.length, 9);
  for (const id of Object.keys(names)) {
    const preset = manager.config.presets.find((rule) => rule.id === id);
    assert.equal(preset.group, id === "trace-backs" ? "coder" : "gm");
  }
});

test("filter groups sort by name without changing saved selections or custom rule order", async (t) => {
  const custom = [
    { id: "custom-zulu", name: "Zulu", pattern: "^zulu" },
    { id: "custom-alpha", name: "alpha", pattern: "^alpha" },
    { id: "custom-ten", name: "Bravo 10", pattern: "^ten" },
    { id: "custom-two", name: "bravo 2", pattern: "^two" }
  ];
  const stored = { ...outputWindowDefaults(), open: true, selected: ["bit-chat", "custom-zulu"], custom };
  const { manager, doc, win, feed } = await createOutputApp(t, { stored });
  const labels = (selector) => [...doc.querySelectorAll(selector + " .output-rule label")].map((label) => label.textContent);
  assert.deepEqual(labels("#output-presets"), ["Fix It", "Free Chat", "Game Help", "Grid Output", "Guided Discussion", "OOC Chat", "OOC Messages", "Politics Wow", "SIC", "Television", "Tip Line", "War Stories", "XHELP"]);
  doc.querySelector("[data-filter-group=gm]").click();
  assert.deepEqual(labels("#output-presets").slice(0, 5), ["All Channels", "Anti Gravity", "Babble Net", "Bit Chat", "Build Yard"]);
  assert.equal(doc.querySelector("[data-output-rule-id=bit-chat]").checked, true);
  doc.querySelector("[data-filter-group=coder]").click();
  assert.deepEqual(labels("#output-presets"), ["Action Listener", "Code Talk", "Debug Info", "Eval Log", "Security Theater", "Trace-Backs"]);
  doc.querySelector("[data-filter-group=custom]").click();
  assert.deepEqual(labels("#output-custom-rules"), ["alpha", "bravo 2", "Bravo 10", "Zulu"]);
  assert.deepEqual(manager.settings.custom.map((rule) => rule.id), custom.map((rule) => rule.id));
  doc.querySelector("[aria-label='Edit Zulu']").click();
  doc.querySelector("#output-rule-name").value = "Aardvark";
  doc.querySelector("#output-rule-form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  assert.deepEqual(labels("#output-custom-rules"), ["Aardvark", "alpha", "bravo 2", "Bravo 10"]);
  assert.equal(doc.querySelector("[data-output-rule-id=custom-zulu]").checked, true);
  await feed("[-][Bit-Chat] restored\nbefore [-][Bit-Chat] stays main\n[-][bit-chat] stays main\n");
  assert.equal(manager.views.secondary.index.length, 1);
  assert.equal(manager.views.main.index.length, 2);
});

test("channel presets route primary and secondary markers once after ANSI decoding", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["team-chat", "all-channels"] });
  await feed("\u001b[33m[+][Team-Chat] primary\u001b[0m\n[-][Team-Chat] secondary\n[+][Future-Channel] primary\n[-][Future-Channel] secondary\nbefore [+][Team-Chat] quoted\n[x][Team-Chat] invalid\n");
  assert.equal(manager.views.secondary.index.length, 4);
  assert.equal(manager.views.main.index.length, 2);
  assert.equal(manager.history.length, 6);
});

test("XHELP routes complete matching lines after ANSI decoding", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["xhelp"] });
  await feed("\u001b[33mXHELP assistance requested\u001b[0m\nXHELPER stays main\nxhelp stays main\nbefore XHELP stays main\n");
  assert.equal(manager.views.secondary.index.length, 1);
  assert.equal(recordText(manager.views.secondary.index.at(0)), "XHELP assistance requested");
  assert.equal(manager.views.main.index.length, 3);
});

test("Television routes complete ANSI-formatted screen broadcasts and preserves ordinary output", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["television"] });
  const screens = ["wall screen", "flatscreen monitor", "television", "security monitor", "touch screen"];
  await feed(screens.map((screen) => "\u001b[36mOn the large " + screen + ": a broadcast\u001b[0m").join("\n")
    + "\nOn the radio: the television: mentioned in dialogue\nordinary output\n");
  assert.equal(manager.views.secondary.index.length, 5);
  assert.equal(manager.views.main.index.length, 2);
  assert.equal(recordText(manager.views.secondary.index.at(0)), "On the large wall screen: a broadcast");
});

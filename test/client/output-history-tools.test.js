import test from "node:test";
import assert from "node:assert/strict";
import { createOutputApp } from "../../test-support/output-app.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 180));
async function expectText(element, expected) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (element.textContent === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(element.textContent, expected);
}

test("Find searches unmounted output, scopes results, and clears old highlights", async (t) => {
  const { manager, feed, doc, win } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  await feed("first literal .* here\n[-][Team-Chat] literal .* there\nthird line\n");
  manager.tools.open();
  const query = doc.querySelector("#output-find-query");
  query.value = "literal .*";
  query.dispatchEvent(new win.Event("input"));
  await settle();
  assert.match(doc.querySelector("#output-find-count").textContent, /1 of 2/);
  manager.views.main.render();
  assert.equal(doc.querySelector("#lineBuffer mark").textContent, "literal .*");
  doc.querySelector("#output-find").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await settle();
  manager.views.secondary.render();
  assert.equal(doc.querySelector("#secondaryBuffer mark").textContent, "literal .*");
  query.value = "third";
  query.dispatchEvent(new win.Event("input"));
  await settle();
  manager.views.main.render();
  manager.views.secondary.render();
  assert.equal(doc.querySelectorAll("mark").length, 1);
  assert.equal(doc.querySelector("mark").textContent, "third");
  const scope = doc.querySelector("#output-find-scope");
  scope.value = "secondary";
  scope.dispatchEvent(new win.Event("input"));
  await settle();
  assert.equal(doc.querySelector("#output-find-count").textContent, "No matches");
  manager.updateSettings({ open: false });
  assert.equal(scope.value, "all");
  doc.querySelector("#output-find-close").click();
  assert.equal(doc.querySelector("#output-find").classList.contains("hide"), true);
});

test("pruning selected native text clears the selection with an explanation", async (t) => {
  const { manager, client, doc, feed, messages } = await createOutputApp(t);
  await feed("one\ntwo\nthree\nfour\nfive\n");
  doc.getSelection().selectAllChildren(manager.views.main.mounted.get(2));
  client.preferences.performanceBuffer = 2;
  manager.prune();
  assert.equal(doc.getSelection().isCollapsed, true);
  assert.ok(messages.some((message) => message.includes("text selection was cleared")));
});

test("native log export uses history and clear cancels a pending export", async (t) => {
  const { manager, client, win, feed, doc } = await createOutputApp(t);
  await feed("first\nsecond\n");
  const downloads = [];
  win.DomeNative = { downloadLog: (name, html) => downloads.push({ name, html }) };
  manager.tools.saveLog();
  await settle();
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].html, /first<\/div><div>second/);
  assert.ok(!downloads[0].html.includes("class=\"output-spacer\""));
  manager.tools.saveLog();
  manager.clear();
  await settle();
  assert.equal(downloads.length, 1);
  assert.equal(doc.querySelector("#output-operation").classList.contains("hide"), true);
  manager.tools.saveLog();
  doc.querySelector("#output-operation-cancel").click();
  await settle();
  assert.equal(downloads.length, 1);
  assert.equal(client.outputWindows.history.length, 0);
});

test("clear discards a partial protocol line and later output remains usable", async (t) => {
  const { manager, client, feed } = await createOutputApp(t);
  await feed("partial");
  manager.clear();
  client.resetOutputProtocol();
  await feed("new line\n");
  assert.equal(manager.history.length, 1);
  assert.equal(manager.views.main.element.textContent, "new line");
});

test("reconnecting resets stream fragments and ANSI state without losing retained history", async (t) => {
  const { manager, client, feed } = await createOutputApp(t);
  await feed("\u001b[31mold red line\npartial old");
  client.resetOutputStream();
  await feed("new connection\n");
  assert.equal(manager.history.length, 2);
  assert.equal(manager.history.get(2).runs[0].text, "new connection");
  assert.deepEqual(manager.history.get(2).runs[0].classes, []);
});

test("closing a split releases its native selection and preserves all history", async (t) => {
  const { manager, feed, doc } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  await feed("main\n[-][Team-Chat] chat\n");
  doc.getSelection().selectAllChildren(manager.views.secondary.mounted.get(2));
  manager.updateSettings({ open: false });
  await manager.idle();
  assert.equal(doc.getSelection().isCollapsed, true);
  assert.equal(manager.views.main.index.length, 2);
  assert.equal(doc.querySelector("[data-output-action]"), null);
});

test("live Find visits only new rows, updates during continuous traffic, and preserves the chosen match", async (t) => {
  const { manager, doc, win, feed } = await createOutputApp(t);
  await feed(Array.from({ length: 20_000 }, (_, i) => "needle row " + i).join("\n") + "\n");
  manager.tools.open();
  const query = doc.querySelector("#output-find-query");
  query.value = "needle";
  query.dispatchEvent(new win.Event("input"));
  const count = doc.querySelector("#output-find-count");
  await expectText(count, "1 of 20000");
  doc.querySelector("#output-find").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await expectText(count, "2 of 20000");
  let visited = 0;
  const snapshot = manager.history.snapshot.bind(manager.history);
  manager.history.snapshot = (...args) => {
    const result = snapshot(...args);
    return { ...result, *[Symbol.iterator]() { for (const record of result) { visited++; yield record; } } };
  };
  await feed("needle fresh\n");
  await expectText(count, "2 of 20001");
  assert.equal(visited, 1);
  assert.equal(manager.views.main.highlight.id, 2);
  let updatedDuringTraffic = false;
  for (let i = 0; i < 8; i++) {
    await feed("needle traffic " + i + "\n");
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (/of 2000[2-9]$/.test(count.textContent)) updatedDuringTraffic = true;
  }
  assert.equal(updatedDuringTraffic, true);
  await expectText(count, "2 of 20009");
  assert.equal(visited, 9);
  manager.client.preferences.performanceBuffer = 2;
  manager.prune();
  await expectText(count, "1 of 2");
});

test("clearing during Find cancels the old snapshot and subsequent results contain only new history", async (t) => {
  const { manager, doc, win, feed } = await createOutputApp(t);
  await feed(Array.from({ length: 2000 }, () => "needle old").join("\n") + "\n");
  manager.tools.open();
  const snapshot = manager.history.snapshot.bind(manager.history);
  let cleared = false;
  manager.history.snapshot = (...args) => {
    const result = snapshot(...args);
    return {
      ...result,
      *[Symbol.iterator]() {
        for (const record of result) {
          yield record;
          if (!cleared) { cleared = true; manager.clear(); }
        }
      }
    };
  };
  const query = doc.querySelector("#output-find-query");
  query.value = "needle";
  query.dispatchEvent(new win.Event("input"));
  await settle();
  assert.equal(cleared, true);
  assert.equal(manager.history.length, 0);
  await feed("needle new\n");
  await settle();
  assert.equal(doc.querySelector("#output-find-count").textContent, "1 of 1");
  doc.querySelector("#output-find").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await settle();
  manager.views.main.render();
  assert.equal(manager.views.main.highlight.id, manager.history.first);
  assert.equal(doc.querySelector("mark").textContent, "needle");
});

test("selected endpoints stay mounted while older rows render and Ctrl+C includes unmounted lines", async (t) => {
  const { manager, doc, win, feed } = await createOutputApp(t);
  let copied;
  Object.defineProperty(win.navigator, "clipboard", { value: { writeText: async (text) => copied = text } });
  await feed(Array.from({ length: 2000 }, (_, i) => "line " + i).join("\n") + "\n");
  const view = manager.views.main;
  view.setPaused(true);
  const source = view.mounted.get(2000).firstChild;
  const selection = doc.getSelection();
  selection.setBaseAndExtent(source, 2, source, 5);
  view.element.scrollTop = 0;
  view.onScroll();
  view.render();
  assert.ok(view.mounted.has(1), "scrolling still mounts old output during a selection");
  assert.ok(source.isConnected, "the selected endpoint is retained");
  assert.ok(view.mounted.size < 150);
  const first = view.mounted.get(1).firstChild;
  selection.setBaseAndExtent(source, 5, first, 2);
  const event = new win.Event("copy", { bubbles: true, cancelable: true });
  doc.body.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  await expectText(doc.querySelector("#output-operation-message"), "Preparing selected output…");
  for (let i = 0; i < 150 && copied == null; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  const expected = Array.from({ length: 2000 }, (_, i) => "line " + i);
  expected[0] = expected[0].slice(2);
  expected[1999] = expected[1999].slice(0, 5);
  assert.equal(copied, expected.join("\n"));
});

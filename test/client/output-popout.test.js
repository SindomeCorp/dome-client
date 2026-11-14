import test from "node:test";
import assert from "node:assert/strict";
import { renderFile } from "ejs";
import { JSDOM } from "jsdom";
import { createOutputApp } from "../../test-support/output-app.js";

async function companion(t, options) {
  const app = await createOutputApp(t, options);
  const html = await renderFile(new URL("../../views/output-window.ejs", import.meta.url).pathname, {});
  const child = new JSDOM(html, { url: "https://example.com/output-window/", pretendToBeVisual: true });
  const popup = child.window;
  let closed = false;
  let request;
  const originalClose = popup.close.bind(popup);
  popup.focus = app.win.focus = () => {};
  popup.close = () => { closed = true; };
  Object.defineProperty(popup, "closed", { get: () => closed });
  app.win.open = (url, name, features) => { request = { url, name, features }; return popup; };
  t.after(() => originalClose());
  const send = (type, extra = {}) => app.win.dispatchEvent(new app.win.MessageEvent("message", {
    source: popup, origin: app.win.location.origin,
    data: { type, instance: new URL(request.url, app.win.location.href).hash.slice("#instance=".length) }, ...extra
  }));
  return { ...app, popup, send, get request() { return request; }, close: () => { closed = true; } };
}

test("pop-out transfers the existing index/state without history iteration or new routing and redocks idempotently", async (t) => {
  const app = await companion(t);
  const { manager, feed, popup, send, doc } = app;
  manager.updateSettings({ open: true, position: "left", selected: ["team-chat"] });
  await feed(Array.from({ length: 500 }, (_, i) => "[-][Team-Chat] row " + i).join("\n") + "\n");
  manager.views.secondary.jump(25, { start: 0, length: 3 });
  await feed("[-][Team-Chat] unread\n");
  const index = manager.views.secondary.index;
  const retired = manager.views.secondary;
  const generation = manager.generation;
  manager.history.snapshot = () => { throw new Error("transfer must not scan history"); };
  manager.popout.open();
  assert.equal(manager.popout.isDetached(), false, "dock remains live until ready");
  assert.match(app.request.features, /width=640,height=480/);
  send("output-popout-ready", { origin: "https://other.example" });
  assert.equal(manager.popout.isDetached(), false);
  send("output-popout-ready", { source: null });
  assert.equal(manager.popout.isDetached(), false);
  send("output-popout-ready");
  retired.render();
  retired.schedule();
  assert.equal(retired.mounted.size, 0, "retired hosts cannot remount hidden history after transfer");
  assert.equal(manager.views.secondary.index, index);
  assert.equal(manager.generation, generation);
  assert.equal(manager.views.secondary.paused, true);
  assert.equal(manager.views.secondary.unread, 1);
  assert.equal(manager.views.secondary.anchor.id, 25);
  assert.equal(manager.views.secondary.highlight.length, 3);
  assert.equal(manager.views.secondary.win, popup);
  assert.equal(doc.querySelector("#button-output-split").textContent, "REDOCK");
  assert.equal(manager.settings.version, 1);
  let focused = 0;
  popup.focus = () => focused++;
  manager.popout.open();
  assert.equal(focused, 1);
  manager.popout.redock({ focus: false });
  manager.popout.redock();
  assert.equal(popup.closed, true);
  assert.equal(manager.views.secondary.index, index);
  assert.equal(manager.views.secondary.win, app.win);
  assert.equal(manager.settings.position, "left");
  popup.document.querySelector("[data-output-pause]").click();
  popup.document.dispatchEvent(new popup.KeyboardEvent("keydown", { key: "Pause" }));
  assert.equal(manager.views.secondary.paused, true, "retired companion controls no longer affect the session");
  popup.document.querySelector("#button-output-find").click();
  assert.equal(popup.document.querySelector("#output-find").classList.contains("hide"), true);
});

test("blocked or throwing opens leave routing and dock intact; native bridges hide launch", async (t) => {
  const { manager, win, doc, messages } = await createOutputApp(t);
  manager.updateSettings({ open: true });
  const generation = manager.generation;
  for (const open of [() => null, () => { throw new Error("blocked"); }]) {
    win.open = open;
    manager.popout.open();
    assert.equal(manager.popout.isDetached(), false);
    assert.equal(manager.generation, generation);
    assert.match(messages.at(-1), /blocked/);
  }
  win.DomeNative = { sendInput() {} };
  manager.popout.refresh();
  assert.equal(doc.querySelector("#button-output-popout").classList.contains("hide"), true);
});

test("redocking uses captured cleanup APIs after the previous host becomes inaccessible", async (t) => {
  const { manager, win, popup, send, feed } = await companion(t);
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  await feed("[-][Team-Chat] retained\n");
  manager.popout.open(); send("output-popout-ready");
  const retired = manager.views.secondary;
  const index = retired.index;
  retired.win = new Proxy(popup, { get() { throw new Error("WindowProxy is inaccessible"); } });
  retired.following = false;
  retired.anchor = null;
  manager.popout.redock({ focus: false });
  assert.equal(retired.destroyed, true);
  assert.equal(retired.mounted.size, 0);
  assert.equal(manager.views.secondary.win, win);
  assert.equal(manager.views.secondary.index, index);
  assert.equal(manager.popout.isDetached(), false);
  await feed("[-][Team-Chat] after\n");
  assert.equal(manager.history.length, 2);
});

test("closed companions and incoming output restore the dock without dropping lines", async (t) => {
  const { manager, popup, feed, send, close } = await companion(t);
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  await feed("[-][Team-Chat] before\n");
  manager.popout.open();
  send("output-popout-ready");
  close();
  await feed("[-][Team-Chat] after\n");
  assert.equal(popup.closed, true);
  assert.equal(manager.popout.isDetached(), false);
  assert.equal(manager.views.secondary.index.length, 2);
  assert.equal(manager.history.length, 2);
});

test("closing, layout changes, import and reset cannot leave a companion behind", async (t) => {
  for (const action of ["close", "layout", "reset", "import"]) {
    const { manager, popup, feed, send } = await companion(t);
    manager.updateSettings({ open: true, selected: ["team-chat"] });
    await feed("[-][Team-Chat] retained\n");
    manager.popout.open(); send("output-popout-ready");
    if (action === "close") manager.closeSplit();
    else if (action === "layout") manager.updateSettings({ position: "bottom" });
    else if (action === "reset") manager.resetSettings();
    else manager.importSettings({ ...manager.settings, open: false });
    await manager.idle();
    assert.equal(popup.closed, true);
    assert.equal(manager.popout.isDetached(), false);
    assert.equal(manager.history.length, 1);
    assert.equal(manager.isSplitOpen(), action === "layout");
  }
});

test("readiness timeout, stale handshakes and child unload safely retain secondary output", async (t) => {
  const { manager, win, popup, send, messages } = await companion(t);
  manager.updateSettings({ open: true });
  const set = win.setTimeout.bind(win);
  let expire;
  win.setTimeout = (fn, delay, ...args) => delay === 10_000 ? (expire = fn, 99999) : set(fn, delay, ...args);
  manager.popout.open();
  expire();
  assert.equal(popup.closed, true);
  assert.match(messages.at(-1), /did not become ready/);
  send("output-popout-ready");
  assert.equal(manager.popout.isDetached(), false);
});

test("parent pagehide closes its companion, while beforeunload and reconnect preserve it", async (t) => {
  const { manager, client, win, popup, send, feed } = await companion(t);
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  await feed("[-][Team-Chat] retained\n");
  manager.popout.open(); send("output-popout-ready");
  win.dispatchEvent(new win.Event("beforeunload"));
  client.resetOutputStream();
  assert.equal(popup.closed, false);
  assert.equal(manager.popout.isDetached(), true);
  win.dispatchEvent(new win.Event("pagehide"));
  assert.equal(popup.closed, true);
  assert.equal(manager.views.secondary.win, win, "shutdown releases the child renderer and document");
  win.dispatchEvent(new win.PageTransitionEvent("pageshow", { persisted: true }));
  assert.equal(manager.popout.isDetached(), false);
});

test("child navigation redocks, malformed readiness cannot steal history, and load failures fall back safely", async (t) => {
  for (const failure of [false, true]) {
    const { manager, popup, send, feed, win } = await companion(t);
    manager.updateSettings({ open: true, selected: ["team-chat"] });
    await feed("[-][Team-Chat] retained\n");
    const index = manager.views.secondary.index;
    manager.popout.open();
    send("output-popout-ready", { data: { type: "output-popout-ready", instance: "wrong-session" } });
    assert.equal(manager.popout.isDetached(), false);
    if (failure) {
      const query = popup.document.querySelector.bind(popup.document);
      popup.document.querySelector = (selector) => selector === "#secondaryBuffer" ? null : query(selector);
    }
    send("output-popout-ready");
    if (!failure) send("output-popout-closing");
    assert.equal(popup.closed, true);
    assert.equal(manager.views.secondary.index, index);
    assert.equal(manager.views.secondary.win, win);
    assert.equal(manager.history.length, 1);
  }
});

test("a paused wrapped row keeps its anchor when the new host measures it shorter", async (t) => {
  const { manager, send, feed } = await companion(t);
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  await feed(Array.from({ length: 500 }, (_, i) => "[-][Team-Chat] long row " + i).join("\n") + "\n");
  const view = manager.views.secondary;
  view.index.measure(249, 1000);
  view.jump(250);
  view.anchor.offset = 900;
  manager.popout.open(); send("output-popout-ready");
  const transferred = manager.views.secondary;
  transferred.index.measure(249, 18);
  transferred.render();
  assert.equal(transferred.anchor.id, 250);
  assert.ok(transferred.anchor.offset < 18);
  assert.ok(transferred.mounted.has(250));
});

test("standalone entry only announces to its same-origin opener and handles direct visits without a session", async (t) => {
  const { popup } = await companion(t);
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = popup;
  globalThis.document = popup.document;
  try {
    await import("../../src/client/entrypoints/output-window.js?direct-visit");
    assert.match(popup.document.querySelector("#output-popout-status").textContent, /No active main client/);
    assert.equal(popup.document.querySelector("#inputBuffer"), null);
    const sent = [];
    popup.opener = { postMessage: (message, origin) => sent.push({ message, origin }) };
    popup.location.hash = "instance=expected-session";
    await import("../../src/client/entrypoints/output-window.js?companion-visit");
    popup.dispatchEvent(new popup.Event("pagehide"));
    assert.deepEqual(sent.map((value) => value.message.type), ["output-popout-ready", "output-popout-closing"]);
    for (const value of sent) {
      assert.equal(value.origin, "https://example.com");
      assert.equal(value.message.instance, "expected-session");
    }
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

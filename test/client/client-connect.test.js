import { test } from "node:test";
import assert from "node:assert/strict";
import setupDom from "../../test-support/setup-dom.js";

test("guest connect stores initial command", async (t) => {
  t.mock.timers.enable();
  const { window } = setupDom(t, "<!doctype html><html><body><a class=\"btn-connect-guest\" href=\"/player-client/\"></a></body></html>");
  const { store } = await import("../../src/client/store.js");
  Object.assign(store, {
    get: () => null,
    put: t.mock.fn(),
    remove: () => {},
    getUsernames: () => [],
    getUser: () => null,
    addUser: () => {},
    purge: () => {}
  });

  await import("../../src/client/pages/client-connect.js?guest");
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.mock.timers.tick(10);
  const button = window.document.querySelector(".btn-connect-guest");
  const evt = new window.Event("click", { cancelable: true });
  try {
    button.dispatchEvent(evt);
  } catch (err) {
    void err;
  }
  assert.equal(store.put.mock.calls.length, 1);
  assert.equal(store.put.mock.calls[0].arguments[0], "dc-initial-command");
  assert.equal(store.put.mock.calls[0].arguments[1], "connect guest");
});

test("stored usernames without fields is handled", async (t) => {
  t.mock.timers.enable();
  const { window } = setupDom(t);
  const { store } = await import("../../src/client/store.js");
  Object.assign(store, {
    get: () => null,
    put: () => {},
    remove: () => {},
    getUsernames: () => ["foo"],
    getUser: () => null,
    addUser: () => {},
    purge: () => {}
  });

  await import("../../src/client/pages/client-connect.js?guest");
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.mock.timers.tick(10);
});

test("manual connect clears guest command", async (t) => {
  t.mock.timers.enable();
  const { window } = setupDom(t, "<!doctype html><html><body><a class=\"btn-connect-other\" href=\"/player-client/\"></a></body></html>");
  const { store } = await import("../../src/client/store.js");
  const origFns = {
    get: store.get,
    put: store.put,
    remove: store.remove,
    getUsernames: store.getUsernames,
    getUser: store.getUser,
    addUser: store.addUser,
    purge: store.purge
  };
  store.get = () => null;
  store.put = () => {};
  store.remove = t.mock.fn();
  store.getUsernames = () => [];
  store.getUser = () => null;
  store.addUser = () => {};
  store.purge = () => {};
  t.after(() => {
    Object.assign(store, origFns);
  });

  await import("../../src/client/pages/client-connect.js?manual");
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.mock.timers.tick(10);
  const button = window.document.querySelector(".btn-connect-other");
  const evt = new window.Event("click", { cancelable: true });
  try {
    button.dispatchEvent(evt);
  } catch (err) {
    void err; // ignore navigation errors
  }
  assert.ok(evt.defaultPrevented);
  const removed = store.remove.mock.calls.map((c) => c.arguments[0]);
  assert.ok(removed.includes("dc-initial-command"));
  assert.ok(removed.includes("dc-user-login"));
});

test("connect_now stores selected host and port before navigation", async (t) => {
  t.mock.timers.enable();
  const html = "<!doctype html><html><body>"
    + "<input id=\"moo-username\" value=\"char\" />"
    + "<input id=\"moo-password\" value=\"pass\" />"
    + "<input id=\"moo-hostname\" value=\"example.org\" />"
    + "<input id=\"moo-port\" value=\"7777\" />"
    + "<button id=\"connect_now\"></button>"
    + "</body></html>";
  const { window } = setupDom(t, html);
  const { store } = await import("../../src/client/store.js");
  const putMock = t.mock.fn();
  Object.assign(store, {
    get: () => null,
    put: putMock,
    remove: () => {},
    getUsernames: () => [],
    getUser: () => null,
    addUser: () => {},
    purge: () => {}
  });

  await import(`../../src/client/pages/client-connect.js?connect-now=${Math.random()}`);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.mock.timers.tick(10);
  const button = window.document.getElementById("connect_now");
  try {
    button.dispatchEvent(new window.Event("click", { cancelable: true }));
  } catch (err) {
    void err;
  }
  const writes = putMock.mock.calls.map((c) => [c.arguments[0], c.arguments[1]]);
  assert.ok(writes.some(([key, val]) => key === "game-hostname" && val === "example.org"));
  assert.ok(writes.some(([key, val]) => key === "game-port" && val === "7777"));
});

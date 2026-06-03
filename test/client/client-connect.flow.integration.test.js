import { test } from "node:test";
import assert from "node:assert/strict";
import setupDom from "../../test-support/setup-dom.js";

test("client-connect flow integration: guest/manual/connect-now update local storage and navigation target", async (t) => {
  t.mock.timers.enable();
  t.mock.method(console, "info", () => {});
  const html = "<!doctype html><html><body>"
    + "<a class=\"btn-connect-guest\" href=\"/player-client/\"></a>"
    + "<a class=\"btn-connect-other\" href=\"/player-client/\"></a>"
    + "<input id=\"moo-username\" value=\"char\" />"
    + "<input id=\"moo-password\" value=\"pass\" />"
    + "<input id=\"moo-hostname\" value=\"example.org\" />"
    + "<input id=\"moo-port\" value=\"7777\" />"
    + "<button id=\"connect_now\"></button>"
    + "</body></html>";
  const { window } = setupDom(t, html, { suppressNavigationErrors: true });
  const { store } = await import("../../src/client/core/store.js");

  const memory = new Map();
  Object.assign(store, {
    get: (k) => memory.has(k) ? memory.get(k) : null,
    put: (k, v) => memory.set(k, v),
    remove: (k) => memory.delete(k),
    getUsernames: () => [],
    getUser: () => null,
    addUser: (u) => {
      memory.set("user", u);
    },
    purge: () => {}
  });
  window.guestConnectCommand = "connect guest";

  await import(`../../src/client/entrypoints/client-connect.js?flow-int=${Date.now()}`);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.mock.timers.tick(20);

  const guestEvent = new window.Event("click", { cancelable: true });
  try {
    window.document.querySelector(".btn-connect-guest").dispatchEvent(guestEvent);
  } catch {
    // ignore jsdom navigation exceptions
  }
  assert.equal(guestEvent.defaultPrevented, true);
  assert.equal(memory.get("dc-initial-command"), "connect guest");

  const manualEvent = new window.Event("click", { cancelable: true });
  try {
    window.document.querySelector(".btn-connect-other").dispatchEvent(manualEvent);
  } catch {
    // ignore jsdom navigation exceptions
  }
  assert.equal(manualEvent.defaultPrevented, true);
  assert.equal(memory.has("dc-initial-command"), false);
  assert.equal(memory.has("dc-user-login"), false);

  const connectNowEvent = new window.Event("click", { cancelable: true });
  try {
    window.document.getElementById("connect_now").dispatchEvent(connectNowEvent);
  } catch {
    // ignore jsdom navigation exceptions
  }
  assert.equal(connectNowEvent.defaultPrevented, true);
  assert.equal(memory.get("game-hostname"), "example.org");
  assert.equal(memory.get("game-port"), "7777");
  assert.equal(memory.get("dc-user-login"), "connect char pass");
});

test("client-connect flow integration: auto query connects known stored user and falls back to default host and port", async (t) => {
  t.mock.timers.enable();
  t.mock.method(console, "info", () => {});
  const html = "<!doctype html><html><body>"
    + "<div id=\"user-picker\" class=\"hide\">"
    + "<button class=\"dropdown-toggle\"></button>"
    + "<span class=\"user-picker-label\"></span>"
    + "<ul class=\"dropdown-menu\"><li class=\"divider\"></li></ul>"
    + "</div>"
    + "<a class=\"btn-connect-guest\" href=\"/player-client/\"></a>"
    + "<a class=\"btn-connect-other\" href=\"/player-client/\"></a>"
    + "<input id=\"moo-username\" value=\"\" />"
    + "<input id=\"moo-password\" value=\"\" />"
    + "<input id=\"moo-hostname\" value=\"\" />"
    + "<input id=\"moo-port\" value=\"\" />"
    + "<button id=\"connect_now\"></button>"
    + "</body></html>";
  const { window } = setupDom(t, html, { suppressNavigationErrors: true });
  const { store } = await import("../../src/client/core/store.js");

  const memory = new Map();
  memory.set("stored-users", ["hero"]);
  memory.set("user-hero-passwd", "pass");
  Object.assign(store, {
    get: (k) => memory.has(k) ? memory.get(k) : null,
    put: (k, v) => memory.set(k, v),
    remove: (k) => memory.delete(k),
    purge: () => {}
  });

  window.history.replaceState({}, "", "/?auto=hero");
  await import(`../../src/client/entrypoints/client-connect.js?flow-int-auto=${Date.now()}`);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.mock.timers.tick(20);

  assert.equal(memory.get("dc-user-login"), "connect hero pass");
  assert.equal(memory.get("game-hostname"), "moo.sindome.org");
  assert.equal(memory.get("game-port"), "5555");
});

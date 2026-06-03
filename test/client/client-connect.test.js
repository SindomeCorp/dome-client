import { test } from "node:test";
import assert from "node:assert/strict";
import setupDom from "../../test-support/setup-dom.js";
import {
  bindConnectPageActions,
  bindConnectPanelNavigation,
  bindSavedUserPicker,
  createConnectAction,
  getParameterByName,
  initializeAddressFields,
  setupConnectPageChrome
} from "../../src/client/features/connection/client-connect-workflows.js";

function createStore(t) {
  return {
    put: t.mock.fn(),
    remove: t.mock.fn()
  };
}

test("guest connect stores initial command", async (t) => {
  t.mock.timers.enable();
  const { window } = setupDom(t, "<!doctype html><html><body><a class=\"btn-connect-guest\" href=\"/player-client/\"></a></body></html>", { suppressNavigationErrors: true });
  const { store } = await import("../../src/client/core/store.js");
  Object.assign(store, {
    get: () => null,
    put: t.mock.fn(),
    remove: () => {},
    getUsernames: () => [],
    getUser: () => null,
    addUser: () => {},
    purge: () => {}
  });

  await import("../../src/client/entrypoints/client-connect.js?guest");
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
  const { store } = await import("../../src/client/core/store.js");
  Object.assign(store, {
    get: () => null,
    put: () => {},
    remove: () => {},
    getUsernames: () => ["foo"],
    getUser: () => null,
    addUser: () => {},
    purge: () => {}
  });

  await import("../../src/client/entrypoints/client-connect.js?guest");
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.mock.timers.tick(10);
});

test("manual connect clears guest command", async (t) => {
  t.mock.timers.enable();
  const { window } = setupDom(t, "<!doctype html><html><body><a class=\"btn-connect-other\" href=\"/player-client/\"></a></body></html>", { suppressNavigationErrors: true });
  const { store } = await import("../../src/client/core/store.js");
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

  await import("../../src/client/entrypoints/client-connect.js?manual");
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
  const { window } = setupDom(t, html, { suppressNavigationErrors: true });
  const { store } = await import("../../src/client/core/store.js");
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

  await import(`../../src/client/entrypoints/client-connect.js?connect-now=${Math.random()}`);
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

test("connect workflow helpers parse query strings and initialize address fields", () => {
  const { window } = setupDom(null, `<!doctype html><html><body>
    <input id="moo-hostname" value="">
    <input id="moo-port" value="7777">
  </body></html>`);

  assert.equal(getParameterByName("auto", "?auto=first+last&x=1"), "first last");
  assert.equal(getParameterByName("missing", "?auto=hero"), null);

  initializeAddressFields({
    doc: window.document,
    host: "moo.example",
    port: "5555"
  });

  assert.equal(window.document.getElementById("moo-hostname").value, "moo.example");
  assert.equal(window.document.getElementById("moo-port").value, "7777");
});

test("connect page chrome temporarily clears existing background images", (t) => {
  t.mock.timers.enable();
  const { window } = setupDom(t, "<!doctype html><html><head></head><body></body></html>");
  window.document.body.style.backgroundImage = "url(hero.png)";

  setupConnectPageChrome({ doc: window.document, win: window });

  assert.equal(window.document.body.style.overflowY, "auto");
  assert.match(window.document.head.textContent, /scrollbar/);
  assert.equal(window.document.body.style.backgroundImage, "none");

  t.mock.timers.tick(10);

  assert.equal(window.document.body.style.backgroundImage, "url(\"hero.png\")");
});

test("connect action stores login only when credentials are present", (t) => {
  const { window } = setupDom(t, `<!doctype html><html><body>
    <input id="moo-username" value="">
    <input id="moo-password" value="">
    <input id="moo-hostname" value="">
    <input id="moo-port" value="">
  </body></html>`, { suppressNavigationErrors: true });
  const store = createStore(t);
  const savedUsersStore = { addUser: t.mock.fn() };
  const connect = createConnectAction({
    doc: window.document,
    win: window,
    store,
    savedUsersStore
  });

  try {
    connect();
  } catch (err) {
    void err;
  }

  const writes = store.put.mock.calls.map((call) => call.arguments);
  assert.equal(savedUsersStore.addUser.mock.callCount(), 0);
  assert.ok(!writes.some(([key]) => key === "dc-user-login"));
  assert.ok(writes.some(([key, value]) => key === "game-hostname" && value === "moo.sindome.org"));
  assert.ok(writes.some(([key, value]) => key === "game-port" && value === "5555"));
});

test("saved user picker handles preset characters, commands, and menu dismissal", (t) => {
  const html = `<!doctype html><html><body>
    <div id="user-picker" class="hide">
      <button class="dropdown-toggle"></button>
      <span class="user-picker-label"></span>
      <ul class="dropdown-menu">
        <li class="character" data-username="Preset">Preset</li>
        <li class="divider"></li>
        <li class="command" data-command="newChar">New</li>
        <li class="command" data-command="purgeAll">Purge</li>
      </ul>
    </div>
    <input id="moo-username" value="">
    <input id="moo-password" value="">
  </body></html>`;
  const { window } = setupDom(t, html);
  const users = new Map([
    ["hero", { username: "hero", password: "pw" }],
    ["Preset", { username: "Preset", password: "presetpw" }]
  ]);
  const savedUsersStore = {
    getUser: (name) => users.get(name) || null,
    purge: t.mock.fn()
  };
  const logger = { info: t.mock.fn() };
  const reload = t.mock.fn();
  const pickerWindow = {
    confirm: () => true,
    prompt: () => "newbie",
    location: { reload }
  };

  bindSavedUserPicker({
    doc: window.document,
    win: pickerWindow,
    logger,
    savedUsersStore,
    usernames: ["Preset", "hero"],
    autoUser: "hero"
  });

  const picker = window.document.getElementById("user-picker");
  const toggle = picker.querySelector(".dropdown-toggle");
  assert.ok(!picker.classList.contains("hide"));
  assert.equal(window.document.getElementById("moo-username").value, "hero");
  assert.equal(picker.querySelectorAll("li.username").length, 1);

  toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.ok(picker.classList.contains("open"));
  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.ok(!picker.classList.contains("open"));

  picker.querySelector("li.character").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(window.document.getElementById("moo-password").value, "presetpw");

  picker.querySelector("[data-command='newChar']").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(window.document.getElementById("moo-username").value, "newbie");

  picker.querySelector("[data-command='purgeAll']").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(savedUsersStore.purge.mock.callCount(), 1);
  assert.equal(reload.mock.callCount(), 1);
});

test("connect page actions support enter, connect_as, guests, and panel navigation", (t) => {
  const { window } = setupDom(t, `<!doctype html><html><body>
    <input id="moo-username" value="hero">
    <input id="moo-password" value="pw">
    <button id="connect_as"></button>
    <button id="connect_now"></button>
    <a class="btn-connect-guest"></a>
    <a class="btn-connect-other"></a>
    <section id="contact_panel" class="hidden-panel"></section>
    <section id="address_panel"></section>
    <button id="next_btn"></button>
    <button id="back_btn"></button>
  </body></html>`, { suppressNavigationErrors: true });
  const store = createStore(t);
  const connect = t.mock.fn();

  bindConnectPageActions({
    doc: window.document,
    win: window,
    store,
    connect,
    guestConnectCommand: "connect visitor"
  });
  bindConnectPanelNavigation({ doc: window.document });

  window.document.dispatchEvent(new window.KeyboardEvent("keypress", { key: "Enter", bubbles: true }));
  window.document.getElementById("connect_as").click();
  window.document.getElementById("connect_now").dispatchEvent(new window.Event("click", { cancelable: true }));
  window.document.querySelector(".btn-connect-guest").dispatchEvent(new window.Event("click", { cancelable: true }));
  window.document.querySelector(".btn-connect-other").dispatchEvent(new window.Event("click", { cancelable: true }));
  window.document.getElementById("next_btn").dispatchEvent(new window.Event("click", { cancelable: true }));

  assert.equal(connect.mock.callCount(), 3);
  assert.deepEqual(store.put.mock.calls[0].arguments, ["dc-initial-command", "connect visitor"]);
  assert.deepEqual(store.remove.mock.calls.map((call) => call.arguments[0]), ["dc-user-login", "dc-initial-command"]);
  assert.ok(!window.document.getElementById("contact_panel").classList.contains("hidden-panel"));
  assert.ok(window.document.getElementById("address_panel").classList.contains("hidden-panel"));

  window.document.getElementById("back_btn").dispatchEvent(new window.Event("click", { cancelable: true }));

  assert.ok(window.document.getElementById("contact_panel").classList.contains("hidden-panel"));
  assert.ok(!window.document.getElementById("address_panel").classList.contains("hidden-panel"));
});

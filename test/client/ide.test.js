import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome, setSocket, socket as origSocket } from "../../src/client/b-variables.js";

// ensure clean environment
const orig = { window: globalThis.window, document: globalThis.document, openIDE: dome.openIDE, socket: origSocket };

test("openIDE reuses existing window after beforeunload", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  dome.preferences = { edittheme: "dark" };
  const fakeSocket = { id: "fake-socket" };
  setSocket(fakeSocket);

  let openCount = 0;
  const openLog = [];
  const windowFeatures = "width=640,height=480,resizable,scrollbars=yes";
  let win;
  const makeWindow = (initialUrl) => {
    const created = {
      closed: false,
      closeCalls: 0,
      messages: [],
      focused: false,
      propertyDrops: 0,
      close() {
        this.closeCalls++;
        this.closed = true;
      },
      addEventListener(type, handler) {
        this["on" + type] = handler;
      },
      postMessage(msg, target) {
        this.messages.push({ msg, target });
      },
      focus() {
        this.focused = true;
      }
    };

    const dropProps = () => {
      created.propertyDrops++;
      delete created.initialEditor;
      delete created.uploadSocket;
    };

    let hrefValue = "about:blank";
    let pathnameValue = "";
    const updateLocation = (value) => {
      const previous = hrefValue;
      if (!value) {
        hrefValue = "about:blank";
        pathnameValue = "";
      } else {
        const resolved = new URL(value, window.location.origin);
        hrefValue = resolved.href;
        pathnameValue = resolved.pathname;
      }
      if (previous === "about:blank" && hrefValue !== "about:blank") {
        dropProps();
      }
    };

    const location = {};
    Object.defineProperty(location, "href", {
      get: () => hrefValue,
      set: (value) => { updateLocation(value); },
      enumerable: true
    });
    Object.defineProperty(location, "pathname", {
      get: () => pathnameValue,
      set: (value) => { pathnameValue = value; },
      enumerable: true
    });
    location.assign = (value) => updateLocation(value);
    location.replace = (value) => updateLocation(value);

    created.location = location;
    created.setLocation = updateLocation;
    created.simulateNavigationLoss = dropProps;

    updateLocation(initialUrl);
    return created;
  };
  window.open = (url = "", name = "", features = "") => {
    openLog.push({ url, name, features });
    if (win && !win.closed) {
      if (url) {
        win.setLocation(url);
      }
      return win;
    }
    openCount++;
    win = makeWindow(url);
    return win;
  };

  await import("../../src/client/ide.js");

  dome.openIDE({ editorName: "one" });
  assert.deepEqual(openLog.map((entry) => entry.url), ["", "/editor/ide/"]);
  assert.deepEqual(openLog.map((entry) => entry.features), [windowFeatures, windowFeatures]);
  assert.equal(openCount, 1);
  assert.equal(win.closeCalls, 0);
  assert.equal(win.propertyDrops >= 1, true);

  win.simulateNavigationLoss();
  assert.equal(Object.prototype.hasOwnProperty.call(win, "initialEditor"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(win, "uploadSocket"), false);

  // about:blank unload shouldn't clear reference before IDE is ready
  win.onunload && win.onunload();

  // IDE signals readiness and initial tab should open
  window.dispatchEvent(new window.MessageEvent("message", { data: { type: "ide-ready" }, source: win }));
  assert.equal(win.messages.length, 1);
  assert.equal(win.messages[0].msg.editor.editorName, "one");
  assert.equal(win.uploadSocket, fakeSocket);

  win.messages = [];

  // simulate user canceling close -> beforeunload fires but unload does not
  win.onbeforeunload && win.onbeforeunload({});

  dome.openIDE({ editorName: "two" });
  assert.equal(openCount, 1);
  assert.equal(win.messages.length, 1);
  assert.equal(win.messages[0].msg.type, "ide-open-tab");
  assert.equal(win.messages[0].msg.editor.editorName, "two");
  assert.equal(win.focused, true);

  // simulate actual unload
  win.closed = true;
  win.onunload && win.onunload();

  dome.openIDE({ editorName: "three" });
  assert.equal(openCount, 2);

  t.after(() => {
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    dome.openIDE = orig.openIDE;
    setSocket(orig.socket);
    delete dome.preferences;
  });
});

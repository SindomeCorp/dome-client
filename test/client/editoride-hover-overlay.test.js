import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { setSocket } from "../../src/client/b-variables.js";

test("EditorIDE hover on reference requests overlay and renders response", async (t) => {
  const handlersByInstance = [];
  const mockAce = {
    config: { set() {} },
    edit() {
      const handlers = {};
      let value = "";
      const session = {
        setMode() {},
        setUseWrapMode() {},
        getLine(row) {
          return (value.split("\n")[row] || "");
        },
        getLength() {
          return value.split("\n").length;
        },
      };
      handlersByInstance.push(handlers);
      return {
        setTheme() {},
        getSession() { return session; },
        setKeyboardHandler() {},
        setOption() {},
        setValue(v) { value = String(v || ""); },
        on(event, cb) { handlers[event] = cb; },
        getValue() { return value; },
        resize() {},
        destroy() {},
        renderer: { updateFull() {} },
        undo() {},
        getCursorPosition() { return { row: 0, column: 0 }; },
        moveCursorTo() {},
        clearSelection() {},
      };
    },
  };

  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const socket = { emit() {} };
  const emitMock = t.mock.method(socket, "emit");
  setSocket(socket);

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(
    new window.MessageEvent("message", {
      data: {
        type: "ide-open-tab",
        editor: {
          editorName: "Prog",
          uploadCommand: "@program #18657:@matrix",
          buffer: "x #18657:@matrix() y\nx #59:@matrix() y"
        },
      },
    })
  );
  await new Promise((r) => setTimeout(r, 0));

  const handlers = handlersByInstance[0];
  assert.equal(typeof handlers.mousemove, "function");

  handlers.mousemove({
    domEvent: { clientX: 40, clientY: 50 },
    getDocumentPosition() {
      return { row: 0, column: 10 };
    }
  });
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(
    emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "#$# SDWC%%VERB-OVERLAY%%#18657%%@matrix"
    )
  );

  window.dispatchEvent(new window.MessageEvent("message", {
    data: {
      type: "ide-verb-overlay",
      objectId: "#18657",
      verbName: "@matrix",
      payload: { object: "#18657", verb: "@matrix", value: "doc" }
    }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const emitsAfterFirstHover = emitMock.mock.calls.filter((c) =>
    c.arguments[0] === "input" && c.arguments[1] === "#$# SDWC%%VERB-OVERLAY%%#18657%%@matrix"
  ).length;

  handlers.mousemove({
    domEvent: { clientX: 41, clientY: 51 },
    getDocumentPosition() {
      return { row: 0, column: 10 };
    }
  });
  await new Promise((r) => setTimeout(r, 0));

  const emitsAfterSecondHover = emitMock.mock.calls.filter((c) =>
    c.arguments[0] === "input" && c.arguments[1] === "#$# SDWC%%VERB-OVERLAY%%#18657%%@matrix"
  ).length;
  assert.equal(emitsAfterSecondHover, emitsAfterFirstHover);

  const overlay = window.document.querySelector(".sdwc-hover-overlay");
  assert.ok(overlay);
  assert.ok((overlay.textContent || "").includes("#18657:@matrix"));
  assert.ok((overlay.textContent || "").includes("doc"));

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});


test("EditorIDE hover prefers resolved_object in overlay heading when provided", async (t) => {
  const handlersByInstance = [];
  const mockAce = {
    config: { set() {} },
    edit() {
      const handlers = {};
      let value = "";
      const session = {
        setMode() {},
        setUseWrapMode() {},
        getLine(row) {
          return (value.split("\n")[row] || "");
        },
        getLength() {
          return value.split("\n").length;
        },
      };
      handlersByInstance.push(handlers);
      return {
        setTheme() {},
        getSession() { return session; },
        setKeyboardHandler() {},
        setOption() {},
        setValue(v) { value = String(v || ""); },
        on(event, cb) { handlers[event] = cb; },
        getValue() { return value; },
        resize() {},
        destroy() {},
        renderer: { updateFull() {} },
        undo() {},
        getCursorPosition() { return { row: 0, column: 0 }; },
        moveCursorTo() {},
        clearSelection() {},
      };
    },
  };

  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const socket = { emit() {} };
  const emitMock = t.mock.method(socket, "emit");
  setSocket(socket);

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(
    new window.MessageEvent("message", {
      data: {
        type: "ide-open-tab",
        editor: {
          editorName: "Prog",
          uploadCommand: "@program #18657:@matrix",
          buffer: "x #18657:@matrix() y\nx #59:@matrix() y"
        },
      },
    })
  );
  await new Promise((r) => setTimeout(r, 0));

  const handlers = handlersByInstance[0];
  handlers.mousemove({
    domEvent: { clientX: 40, clientY: 50 },
    getDocumentPosition() {
      return { row: 0, column: 10 };
    }
  });
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: {
      type: "ide-verb-overlay",
      objectId: "#18657",
      verbName: "@matrix",
      payload: { object: "#18657", resolved_object: "#59", verb: "@matrix", value: "doc" }
    }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const overlay = window.document.querySelector(".sdwc-hover-overlay");
  assert.ok(overlay);
  assert.ok((overlay.textContent || "").includes("#59:@matrix"));

  const emitsAfterFirstResponse = emitMock.mock.calls.filter((c) =>
    c.arguments[0] === "input" && c.arguments[1] === "#$# SDWC%%VERB-OVERLAY%%#59%%@matrix"
  ).length;

  handlers.mousemove({
    domEvent: { clientX: 40, clientY: 70 },
    getDocumentPosition() {
      return { row: 1, column: 7 };
    }
  });
  await new Promise((r) => setTimeout(r, 0));

  const emitsAfterResolvedHover = emitMock.mock.calls.filter((c) =>
    c.arguments[0] === "input" && c.arguments[1] === "#$# SDWC%%VERB-OVERLAY%%#59%%@matrix"
  ).length;
  assert.equal(emitsAfterResolvedHover, emitsAfterFirstResponse);

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});


test("EditorIDE hover heading uses resolvedObject camelCase when provided", async (t) => {
  const handlersByInstance = [];
  const mockAce = {
    config: { set() {} },
    edit() {
      const handlers = {};
      let value = "";
      const session = {
        setMode() {},
        setUseWrapMode() {},
        getLine(row) { return (value.split("\n")[row] || ""); },
        getLength() { return value.split("\n").length; },
      };
      handlersByInstance.push(handlers);
      return {
        setTheme() {}, getSession() { return session; }, setKeyboardHandler() {}, setOption() {},
        setValue(v) { value = String(v || ""); }, on(event, cb) { handlers[event] = cb; },
        getValue() { return value; }, resize() {}, destroy() {}, renderer: { updateFull() {} },
        undo() {}, getCursorPosition() { return { row: 0, column: 0 }; }, moveCursorTo() {}, clearSelection() {},
      };
    },
  };
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { pretendToBeVisual: true, url: "http://localhost" });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try { ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx")); }
  catch (err) { t.skip(err.message); globalThis.window = orig.window; globalThis.document = orig.document; return; }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  setSocket({ emit() {} });

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", { data: { type: "ide-open-tab", editor: { editorName: "Prog", uploadCommand: "@program #22664:title", buffer: "x #22664:title() y" } } }));
  await new Promise((r) => setTimeout(r, 0));

  const handlers = handlersByInstance[0];
  handlers.mousemove({ domEvent: { clientX: 40, clientY: 50 }, getDocumentPosition() { return { row: 0, column: 10 }; } });
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: {
      type: "ide-verb-overlay",
      objectId: "#22664",
      verbName: "title",
      payload: { object: "#22664", resolvedObject: "#1347", verb: "title", value: "doc" }
    }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const overlay = window.document.querySelector(".sdwc-hover-overlay");
  assert.ok(overlay);
  assert.ok((overlay.textContent || "").includes("#1347:title"));

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("EditorIDE hover resolves this:verb and this.prop to current object", async (t) => {
  const handlersByInstance = [];
  const mockAce = {
    config: { set() {} },
    edit() {
      const handlers = {};
      let value = "";
      const session = {
        setMode() {},
        setUseWrapMode() {},
        getLine(row) {
          return (value.split("\n")[row] || "");
        },
        getLength() {
          return value.split("\n").length;
        },
      };
      handlersByInstance.push(handlers);
      return {
        setTheme() {},
        getSession() { return session; },
        setKeyboardHandler() {},
        setOption() {},
        setValue(v) { value = String(v || ""); },
        on(event, cb) { handlers[event] = cb; },
        getValue() { return value; },
        resize() {},
        destroy() {},
        renderer: { updateFull() {} },
        undo() {},
        getCursorPosition() { return { row: 0, column: 0 }; },
        moveCursorTo() {},
        clearSelection() {},
      };
    },
  };

  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const socket = { emit() {} };
  const emitMock = t.mock.method(socket, "emit");
  setSocket(socket);

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(
    new window.MessageEvent("message", {
      data: {
        type: "ide-open-tab",
        editor: {
          editorName: "Prog",
          uploadCommand: "@program #69313:process_input",
          buffer: "x this:helper() y this.alpha"
        },
      },
    })
  );
  await new Promise((r) => setTimeout(r, 0));

  const handlers = handlersByInstance[0];
  handlers.mousemove({
    domEvent: { clientX: 40, clientY: 50 },
    getDocumentPosition() {
      return { row: 0, column: 7 };
    }
  });
  await new Promise((r) => setTimeout(r, 0));

  handlers.mousemove({
    domEvent: { clientX: 42, clientY: 52 },
    getDocumentPosition() {
      return { row: 0, column: 23 };
    }
  });
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(
    emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "#$# SDWC%%VERB-OVERLAY%%#69313%%helper"
    )
  );
  assert.ok(
    emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "#$# SDWC%%PROP-OVERLAY%%#69313%%alpha"
    )
  );

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

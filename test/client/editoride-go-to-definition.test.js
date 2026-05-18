import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { setSocket } from "../../src/client/b-variables.js";

const setupAndLoad = async (t, options = {}) => {
  const aceInstances = [];
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
      const inst = {
        setTheme() {},
        getSession() {
          return session;
        },
        setKeyboardHandler() {},
        setOption() {},
        setValue(v) {
          value = String(v || "");
        },
        on(event, cb) {
          handlers[event] = cb;
        },
        getValue() {
          return value;
        },
        resize() {},
        destroy() {},
        renderer: { updateFull() {} },
        undo() {},
        getCursorPosition() {
          return { row: 0, column: 0 };
        },
        moveCursorTo() {},
        clearSelection() {},
        __handlers: handlers,
      };
      aceInstances.push(inst);
      return inst;
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
    return null;
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
          editorName: options.editorName || "Prog",
          uploadCommand: options.uploadCommand || "@program #18657:@matrix",
          buffer: options.buffer || ""
        },
      },
    })
  );
  await new Promise((r) => setTimeout(r, 0));

  return {
    window,
    root,
    orig,
    aceInstances,
    emitMock,
    cleanup() {
      root.unmount();
      globalThis.window = orig.window;
      globalThis.document = orig.document;
    }
  };
};

test("EditorIDE cmd/ctrl+click opens #obj:verb definition", async (t) => {
  const ctx = await setupAndLoad(t, {
    buffer: "call #18657:@matrix here",
  });
  if (!ctx) return;

  const click = ctx.aceInstances[0].__handlers.click;
  assert.equal(typeof click, "function");

  click({
    domEvent: { metaKey: true, ctrlKey: false, preventDefault() {}, stopPropagation() {} },
    getDocumentPosition() {
      return { row: 0, column: 12 };
    },
  });

  assert.ok(
    ctx.emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "@edit #18657:@matrix"
    )
  );

  ctx.cleanup();
});

test("EditorIDE cmd/ctrl+click opens $cored references and trims ()", async (t) => {
  const ctx = await setupAndLoad(t, {
    buffer: "run $string_utils:nn() and $string_utils.alphabet",
  });
  if (!ctx) return;

  const click = ctx.aceInstances[0].__handlers.click;
  assert.equal(typeof click, "function");

  click({
    domEvent: { metaKey: false, ctrlKey: true, preventDefault() {}, stopPropagation() {} },
    getDocumentPosition() {
      return { row: 0, column: 10 };
    },
  });

  click({
    domEvent: { metaKey: false, ctrlKey: true, preventDefault() {}, stopPropagation() {} },
    getDocumentPosition() {
      return { row: 0, column: 33 };
    },
  });

  assert.ok(
    ctx.emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "@edit $string_utils:nn"
    )
  );
  assert.ok(
    ctx.emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "@edit $string_utils.alphabet"
    )
  );

  ctx.cleanup();
});

test("EditorIDE cmd/ctrl+click resolves this:verb and this.prop to current object", async (t) => {
  const ctx = await setupAndLoad(t, {
    uploadCommand: "@program #69313:process_input",
    buffer: "run this:helper() and this.alpha",
  });
  if (!ctx) return;

  const click = ctx.aceInstances[0].__handlers.click;
  assert.equal(typeof click, "function");

  click({
    domEvent: { metaKey: false, ctrlKey: true, preventDefault() {}, stopPropagation() {} },
    getDocumentPosition() {
      return { row: 0, column: 6 };
    },
  });

  click({
    domEvent: { metaKey: false, ctrlKey: true, preventDefault() {}, stopPropagation() {} },
    getDocumentPosition() {
      return { row: 0, column: 24 };
    },
  });

  assert.ok(
    ctx.emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "@edit #69313:helper"
    )
  );
  assert.ok(
    ctx.emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "@edit #69313.alpha"
    )
  );

  ctx.cleanup();
});

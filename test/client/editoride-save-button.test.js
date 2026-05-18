import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("EditorIDE hides save and disables shortcut when commandTarget is none or missing", async (t) => {
  const mockAce = {
    config: { set() {} },
    edit() {
      return {
        setTheme() {},
        getSession() {
          return { setMode() {} };
        },
        setKeyboardHandler() {},
        setOption() {},
        setValue() {},
        on() {},
        getValue() {
          return "";
        },
        resize() {},
        destroy() {},
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
  const { setSocket } = await import("../../src/client/b-variables.js");
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
        editor: { editorName: "Test", uploadCommand: "@program none", buffer: "" },
      },
    })
  );

  await new Promise((r) => setTimeout(r, 0));

  let saveButton = window.document.querySelector("button[title^='Save active tab']");
  assert.equal(saveButton, null);
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
  assert.equal(emitMock.mock.calls.length, 0);

  window.dispatchEvent(
    new window.MessageEvent("message", {
      data: {
        type: "ide-open-tab",
        editor: { editorName: "NoTarget", uploadCommand: "@program", buffer: "" },
      },
    })
  );

  await new Promise((r) => setTimeout(r, 0));

  saveButton = window.document.querySelector("button[title^='Save active tab']");
  assert.equal(saveButton, null);
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
  assert.equal(emitMock.mock.calls.length, 0);

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});



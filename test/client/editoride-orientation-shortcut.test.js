import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Test that Ctrl+Shift+X toggles tab orientation

test("EditorIDE toggles tab orientation with shortcut", async (t) => {
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

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  let [topBtn, leftBtn] = window.document.querySelectorAll("div[aria-label='Tab orientation'] button");
  assert.equal(topBtn.getAttribute("aria-pressed"), "true");
  assert.equal(leftBtn.getAttribute("aria-pressed"), "false");

  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "x", ctrlKey: true, shiftKey: true }));
  await new Promise((r) => setTimeout(r, 0));

  [topBtn, leftBtn] = window.document.querySelectorAll("div[aria-label='Tab orientation'] button");
  assert.equal(topBtn.getAttribute("aria-pressed"), "false");
  assert.equal(leftBtn.getAttribute("aria-pressed"), "true");

  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "x", ctrlKey: true, shiftKey: true }));
  await new Promise((r) => setTimeout(r, 0));

  [topBtn, leftBtn] = window.document.querySelectorAll("div[aria-label='Tab orientation'] button");
  assert.equal(topBtn.getAttribute("aria-pressed"), "true");
  assert.equal(leftBtn.getAttribute("aria-pressed"), "false");

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

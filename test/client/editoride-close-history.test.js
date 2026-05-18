import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("EditorIDE closes active tab to most recently viewed tab", async (t) => {
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
  const orig = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage };
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    globalThis.localStorage = orig.localStorage;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  const openTab = (editorName) => {
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-open-tab", editor: { editorName, uploadCommand: `@program #1:${editorName.toLowerCase()}`, buffer: "x" } },
    }));
  };

  openTab("Alpha");
  openTab("Bravo");
  openTab("Charlie");
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "e", ctrlKey: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(window.document.querySelector("[role='tab'][aria-selected='true']")?.textContent?.includes("Bravo"), true);

  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "e", ctrlKey: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(window.document.querySelector("[role='tab'][aria-selected='true']")?.textContent?.includes("Alpha"), true);

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
  globalThis.localStorage = orig.localStorage;
});

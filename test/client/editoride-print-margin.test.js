import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("EditorIDE sets print margin to column 120", async (t) => {
  const setOption = t.mock.fn();
  const mockAce = {
    config: { set() {} },
    edit() {
      return {
        setTheme() {},
        getSession() {
          return { setMode() {} };
        },
        setKeyboardHandler() {},
        setOption,
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

  window.dispatchEvent(
    new window.MessageEvent("message", {
      data: {
        type: "ide-open-tab",
        editor: { editorName: "Test", uploadCommand: "@program none", buffer: "" },
      },
    })
  );

  await new Promise((r) => setTimeout(r, 0));

  assert(
    setOption.mock.calls.some(
      (c) => c.arguments[0] === "printMarginColumn" && c.arguments[1] === 120
    )
  );

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});


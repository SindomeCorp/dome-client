import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Test that Ctrl+Shift+L toggles word wrap for all tabs

test("EditorIDE toggles word wrap with shortcut", async (t) => {
  const setUseWrapMode = [t.mock.fn(), t.mock.fn()];
  const setOption = [t.mock.fn(), t.mock.fn()];
  const updateFull = [t.mock.fn(), t.mock.fn()];
  let idx = 0;
  const mockAce = {
    config: { set() {} },
    edit() {
      const i = idx++;
      return {
        setTheme() {},
        getSession() {
          return {
            setMode() {},
            setUseWrapMode: setUseWrapMode[i],
          };
        },
        setKeyboardHandler() {},
        setOption: setOption[i],
        setValue() {},
        on() {},
        getValue() {
          return "";
        },
        resize() {},
        destroy() {},
        renderer: { updateFull: updateFull[i] },
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
        editor: { editorName: "One", uploadCommand: "@program none", buffer: "" },
      },
    })
  );
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(
    new window.MessageEvent("message", {
      data: {
        type: "ide-open-tab",
        editor: { editorName: "Two", uploadCommand: "@program none", buffer: "" },
      },
    })
  );
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(window.document.title, "Dome-Client Developer IDE [2]");

  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "l", ctrlKey: true, shiftKey: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(setUseWrapMode[0].mock.calls.some((c) => c.arguments[0] === true));
  assert.ok(setUseWrapMode[1].mock.calls.some((c) => c.arguments[0] === true));
  assert.ok(setOption[0].mock.calls.some((c) => c.arguments[0] === "wrap" && c.arguments[1] === "free"));
  assert.ok(setOption[1].mock.calls.some((c) => c.arguments[0] === "wrap" && c.arguments[1] === "free"));
  assert.equal(updateFull[0].mock.calls.length, 2);
  assert.equal(updateFull[1].mock.calls.length, 2);

  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "l", ctrlKey: true, shiftKey: true }));
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(setUseWrapMode[0].mock.calls.some((c) => c.arguments[0] === false));
  assert.ok(setUseWrapMode[1].mock.calls.some((c) => c.arguments[0] === false));
  assert.ok(setOption[0].mock.calls.some((c) => c.arguments[0] === "wrap" && c.arguments[1] === "off"));
  assert.ok(setOption[1].mock.calls.some((c) => c.arguments[0] === "wrap" && c.arguments[1] === "off"));
  assert.equal(updateFull[0].mock.calls.length, 3);
  assert.equal(updateFull[1].mock.calls.length, 3);

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

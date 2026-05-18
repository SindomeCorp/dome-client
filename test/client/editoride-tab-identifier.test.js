import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { setSocket } from "../../src/client/b-variables.js";

// Test that EditorIDE differentiates tabs using editorName + command target
// so multiple @@set_note tabs can coexist.

// We'll mock Ace to avoid loading it.
const mockAce = {
  config: { set() {} },
  edit() {
    return {
      setTheme() {},
      getSession() { return { setMode() {} }; },
      setKeyboardHandler() {},
      setOption() {},
      setValue() {},
      on() {},
      getValue() { return ""; },
      resize() {},
      destroy() {},
    };
  },
};

test("EditorIDE opens distinct tabs for same editorName with different targets", async (t) => {
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

  // Open first note tab
  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Note", uploadCommand: "@@set_note foo" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  // Open second note tab with different target
  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Note", uploadCommand: "@@set_note bar" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  // Should have two tabs
  let tabs = window.document.querySelectorAll("[role='tab']");
  assert.equal(tabs.length, 2);

  // Reopen first note tab (same target) - should not create new tab
  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Note", uploadCommand: "@@set_note foo" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  tabs = window.document.querySelectorAll("[role='tab']");
  assert.equal(tabs.length, 2);

  assert.equal(emitMock.mock.calls.length, 1);
  assert.deepEqual(emitMock.mock.calls[0].arguments, [
    "input",
    "@@editor-message There was already a tab with that information open so we have switched the view to that. We did not update the contents."
  ]);

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

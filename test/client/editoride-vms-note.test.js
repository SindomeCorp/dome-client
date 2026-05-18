import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { setSocket } from "../../src/client/b-variables.js";

const mockAce = {
  config: { set() {} },
  edit(node) {
    let value = "";
    const handlers = {};
    const session = {
      setMode() {},
      setUseWrapMode() {},
      getLine() { return ""; },
      getLength() { return 0; },
    };
    return {
      _node: node,
      setTheme() {},
      getSession() { return session; },
      setKeyboardHandler() {},
      setOption() {},
      renderer: { updateFull() {} },
      setValue(next) { value = next; },
      getValue() { return value; },
      on(name, cb) { handlers[name] = cb; },
      resize() {},
      destroy() {},
      getCursorPosition() { return { row: 0, column: 0 }; },
      undo() {},
      moveCursorTo() {},
      clearSelection() {},
      _handlers: handlers,
    };
  },
};

const waitTick = () => new Promise((r) => setTimeout(r, 0));

const renderEditor = async (t) => {
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
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    t.skip(err.message);
    return null;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const socket = { emit() {} };
  const emitMock = t.mock.method(socket, "emit");
  setSocket(socket);

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await waitTick();

  const cleanup = () => {
    root.unmount();
    globalThis.window = orig.window;
    globalThis.document = orig.document;
  };

  return { window, emitMock, cleanup };
};

const openTab = async (window, editor) => {
  window.dispatchEvent(
    new window.MessageEvent("message", {
      data: {
        type: "ide-open-tab",
        editor,
      },
    })
  );
  await waitTick();
};

test("VMS note field is hidden for non-program tabs", async (t) => {
  const env = await renderEditor(t);
  if (!env) return;
  const { window, cleanup } = env;
  try {
    await openTab(window, { editorName: "Note", uploadCommand: "@@set_note foo", buffer: "body" });
    assert.equal(window.document.querySelector("input[aria-label='VMS note']"), null);
  } finally {
    cleanup();
  }
});

test("VMS note field is hidden when program note is blank and shows after prompt submit", async (t) => {
  const env = await renderEditor(t);
  if (!env) return;
  const { window, emitMock, cleanup } = env;
  try {
    await openTab(window, { editorName: "Verb", uploadCommand: "@program #123:test", buffer: "return 1;" });
    assert.equal(window.document.querySelector("input[aria-label='VMS note']"), null);

    const saveButton = window.document.querySelector("button[title^='Save active tab']");
    saveButton.click();
    await waitTick();

    const promptInput = window.document.querySelector("input[aria-label='VMS note prompt input']");
    assert.ok(promptInput);
    promptInput.value = "Initial note";
    promptInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitTick();

    assert.equal(emitMock.mock.calls.length, 3);
    assert.deepEqual(emitMock.mock.calls.map((call) => call.arguments), [
      ["input", "@program #123:test"],
      ["input", "return 1;\n."],
      ["input", "Initial note"],
    ]);
    assert.ok(window.document.querySelector("input[aria-label='VMS note']"));
  } finally {
    cleanup();
  }
});

test("VMS prompt cancel aborts save emits (Cancel button and Esc)", async (t) => {
  const env = await renderEditor(t);
  if (!env) return;
  const { window, emitMock, cleanup } = env;
  try {
    await openTab(window, { editorName: "Verb", uploadCommand: "@program #321:test", buffer: "line" });
    window.document.querySelector("button[title^='Save active tab']").click();
    await waitTick();
    window.document.querySelector("button").blur?.();
    const cancelButton = Array.from(window.document.querySelectorAll("button")).find((btn) => btn.textContent.trim() === "Cancel");
    cancelButton.click();
    await waitTick();
    assert.equal(emitMock.mock.calls.length, 0);

    window.document.querySelector("button[title^='Save active tab']").click();
    await waitTick();
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await waitTick();
    assert.equal(emitMock.mock.calls.length, 0);
  } finally {
    cleanup();
  }
});

test("VMS prompt submit via Enter saves with emit order and subsequent saves reuse note", async (t) => {
  const env = await renderEditor(t);
  if (!env) return;
  const { window, emitMock, cleanup } = env;
  try {
    await openTab(window, { editorName: "Verb", uploadCommand: "@program #456:test", buffer: "x = 1;" });

    window.document.querySelector("button[title^='Save active tab']").click();
    await waitTick();
    const promptInput = window.document.querySelector("input[aria-label='VMS note prompt input']");
    promptInput.value = "First note";
    promptInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitTick();

    assert.deepEqual(emitMock.mock.calls.map((call) => call.arguments), [
      ["input", "@program #456:test"],
      ["input", "x = 1;\n."],
      ["input", "First note"],
    ]);

    window.document.querySelector("button[title^='Save active tab']").click();
    await waitTick();

    assert.equal(window.document.querySelector("input[aria-label='VMS note prompt input']"), null);
    assert.deepEqual(emitMock.mock.calls.map((call) => call.arguments), [
      ["input", "@program #456:test"],
      ["input", "x = 1;\n."],
      ["input", "First note"],
      ["input", "@program #456:test"],
      ["input", "x = 1;\n."],
      ["input", "First note"],
    ]);
  } finally {
    cleanup();
  }
});

test("VMS prompt submit with blank note saves without third note emit", async (t) => {
  const env = await renderEditor(t);
  if (!env) return;
  const { window, emitMock, cleanup } = env;
  try {
    await openTab(window, { editorName: "Verb", uploadCommand: "@program #789:test", buffer: "player:tell(\"ok\")" });

    window.document.querySelector("button[title^='Save active tab']").click();
    await waitTick();
    const promptInput = window.document.querySelector("input[aria-label='VMS note prompt input']");
    promptInput.value = "   ";
    promptInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitTick();

    assert.deepEqual(emitMock.mock.calls.map((call) => call.arguments), [
      ["input", "@program #789:test"],
      ["input", "player:tell(\"ok\")\n."],
    ]);
  } finally {
    cleanup();
  }
});

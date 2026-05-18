import { test } from "node:test";
import assert from "node:assert/strict";
import setupDom from "../../test-support/setup-dom.js";
import { setupEditor, attachUpload, attachAbort } from "../../src/client/pages/editor-utils.js";

const bodyHtml = `
  <div class="editor"><textarea></textarea></div>
  <button class="upload"></button>
  <button class="abort"></button>
  <div id="verb-status-holder"></div>
`;

const html = `<!doctype html><html><head><title></title></head><body>${bodyHtml}</body></html>`;

test("editor window", async (t) => {
  let window;
  let socket;
  let parent;
  let beforeUnloadHandlers = [];

  t.before(async () => {
    ({ window } = setupDom(t, html));
    const originalAdd = window.addEventListener.bind(window);
    window.addEventListener = (type, handler, options) => {
      if (type === "beforeunload") {
        beforeUnloadHandlers.push(handler);
      }
      return originalAdd(type, handler, options);
    };
    socket = { emit: t.mock.fn() };
    window.uploadSocket = socket;
    parent = { dome: { editorClosed: t.mock.fn() } };
    window.parentWindow = parent;
    await import("../../src/client/pages/editor-window.js");
  });

  t.afterEach(() => {
    window.document.body.innerHTML = bodyHtml;
    window.document.title = "";
    window.editorData = null;
    socket.emit.mock.resetCalls();
    parent.dome.editorClosed.mock.resetCalls();
    delete window.close;
    delete window.confirm;
    for (const handler of beforeUnloadHandlers) {
      window.removeEventListener("beforeunload", handler);
    }
    beforeUnloadHandlers = [];
  });

  await t.test("initializes and handles save and close", async () => {
    window.editorData = { editorName: "Doc", uploadCommand: "save", buffer: "hi" };
    let closed = false;
    window.close = () => { closed = true; };
    let confirmCalls = 0;
    window.confirm = () => { confirmCalls++; return true; };
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    const uploadBtn = window.document.querySelector("button.upload");
    const abortBtn = window.document.querySelector("button.abort");
    const textArea = window.document.querySelector("div.editor textarea");
    assert.equal(window.document.title, "Editing Doc");
    assert.equal(uploadBtn.innerHTML, "save");
    assert.equal(textArea.value, "hi");
    textArea.value = "changed";
    textArea.dispatchEvent(new window.Event("input"));
    uploadBtn.dispatchEvent(new window.Event("click"));
    assert.deepEqual(socket.emit.mock.calls.map(c => c.arguments), [["input", "save"], ["input", "changed\n."]]);
    abortBtn.dispatchEvent(new window.Event("click"));
    assert.equal(confirmCalls, 0);
    assert.ok(closed);
    assert.equal(parent.dome.editorClosed.mock.calls[0].arguments[0], "Doc");
  });

  await t.test("beforeunload warns on unsaved changes", async () => {
    window.editorData = { editorName: "Doc", uploadCommand: "save", buffer: "hi" };
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    const textArea = window.document.querySelector("div.editor textarea");
    textArea.value = "changed";
    textArea.dispatchEvent(new window.Event("input"));
    const evt = new window.Event("beforeunload", { cancelable: true });
    const cancelled = !window.dispatchEvent(evt);
    assert.ok(cancelled);
    assert.equal(evt.defaultPrevented, true);
    assert.equal(parent.dome.editorClosed.mock.calls.length, 0);
    textArea.value = "hi";
    textArea.dispatchEvent(new window.Event("input"));
    const evt2 = new window.Event("beforeunload", { cancelable: true });
    const cancelled2 = !window.dispatchEvent(evt2);
    assert.equal(cancelled2, false);
    assert.equal(parent.dome.editorClosed.mock.calls[0].arguments[0], "Doc");
  });

  await t.test("editor utils support setup, upload, and abort", async () => {
    const initial = { value: "start" };
    const cta = window.document.querySelector("button.upload");
    const abort = window.document.querySelector("button.abort");
    const textarea = window.document.querySelector("div.editor textarea");
    setupEditor({ uploadCommand: "SAVE", editorName: "Doc", cta });
    attachUpload({ uploadCommand: "SAVE", cta, getUploadData: () => textarea.value, setInitial: v => { initial.value = v; } });
    let closed = false;
    attachAbort({ abortButton: abort, getValue: () => textarea.value, initialValueRef: initial, onAbort: () => { closed = true; } });
    textarea.value = "updated";
    cta.dispatchEvent(new window.Event("click"));
    abort.dispatchEvent(new window.Event("click"));
    assert.equal(window.document.title, "Editing Doc");
    assert.deepEqual(socket.emit.mock.calls.map(c => c.arguments), [["input", "SAVE"], ["input", "updated\n."]]);
    assert.ok(closed);
  });
});


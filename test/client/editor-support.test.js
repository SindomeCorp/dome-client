import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome, logger, setSocket } from "../../src/client/b-variables.js";

// global setup for module side effects
const dom = new JSDOM("<!doctype html><html><body><div id=\"editor-list-view\"></div></body></html>", { pretendToBeVisual: true });
const { window } = dom;
const orig = { window: globalThis.window, document: globalThis.document, socket: dome.socket };

globalThis.window = window;
globalThis.document = window.document;
setSocket({});

Object.assign(dome, { spawned: {}, preferences: { edittheme: "dark", editorType: "ide" }, editorListView: window.document.querySelector("#editor-list-view"), socket: {} });

await import("../../src/client/s-editor.js");

test.after(() => {
  globalThis.window = orig.window;
  globalThis.document = orig.document;
  setSocket(orig.socket);
});

function resetEnvironment() {
  dome.spawned = {};
  const oldView = dome.editorListView;
  const newView = oldView.cloneNode(false);
  oldView.parentNode.replaceChild(newView, oldView);
  dome.editorListView = newView;
  dome.preferences.editorType = "ide";
  delete dome.openIDE;
}

test("makeEditor cancels when existing window is not replaced", () => {
  resetEnvironment();
  dome.preferences.editorType = "windows";
  dome.setupEditorSupport();

  let openCalled = false;
  window.open = () => {
    openCalled = true;
  };

  const existing = {
    focused: false,
    confirm() { return false; },
    focus() { this.focused = true; }
  };
  dome.spawned.Editor1 = existing;

  const result = dome.makeEditor({ editorName: "Editor1", buffer: "data" });
  assert.equal(result, null);
  assert.equal(openCalled, false);
  assert.equal(existing.focused, true);
  assert.equal(dome.spawned.Editor1, existing);
});

test("makeEditor selects type and updates existing window", () => {
  resetEnvironment();
  dome.preferences.editorType = "windows";
  dome.setupEditorSupport();

  const opened = [];
  window.open = (url, name) => {
    opened.push({ url, name });
    return { focus() {}, addEventListener() {} };
  };

  dome.makeEditor({ editorName: "Basic", uploadCommand: "@something", buffer: "a" });
  assert.ok(opened[0].url.includes("/editor/basic/"));

  dome.makeEditor({ editorName: "Explicit", type: "custom", buffer: "b" });
  assert.ok(opened[1].url.includes("/editor/custom/"));

  const existing = {
    updated: null,
    confirm() { return true; },
    focus() {},
    updateEditor(buf) { this.updated = buf; },
    addEventListener() {}
  };
  dome.spawned.Updater = existing;
  const res = dome.makeEditor({ editorName: "Updater", buffer: "\ntext\n" });
  assert.equal(res, existing);
  assert.equal(existing.updated, "text");
  assert.equal(opened.length, 2);
});

test("makeEditor routes editors to IDE", () => {
  resetEnvironment();

  window.open = assert.fail;
  const opened = [];
  dome.openIDE = (editor) => { opened.push(editor); };

  dome.setupEditorSupport();

  const editor = { editorName: "Editor1", uploadCommand: "@program", buffer: "data" };
  const res = dome.makeEditor(editor);

  assert.equal(res, null);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].editorName, "Editor1");
});

test("makeEditor uses individual windows when editorType is windows", () => {
  resetEnvironment();
  dome.preferences.editorType = "windows";

  const opened = [];
  window.open = (url, name) => {
    opened.push({ url, name });
    return { focus() {}, addEventListener() {} };
  };

  dome.setupEditorSupport();

  const editor = { editorName: "Verb", uploadCommand: "@program", buffer: "code" };
  const res = dome.makeEditor(editor);

  assert.ok(res);
  assert.ok(opened[0].url.includes("/editor/verb/"));
});

test("updateEditorListView handles missing view and empty list", () => {
  resetEnvironment();
  dome.preferences.editorType = "windows";
  dome.setupEditorSupport();

  let warned = false;
  const origWarn = logger.warn;
  logger.warn = () => { warned = true; };

  const savedView = dome.editorListView;
  dome.editorListView = null;
  dome.updateEditorListView();
  assert.equal(warned, true);
  dome.editorListView = savedView;
  logger.warn = origWarn;

  dome.spawned = {};
  dome.updateEditorListView();
  assert.equal(dome.editorListView.innerHTML, "");
});

test("updateEditorListView renders list and handles clicks", () => {
  resetEnvironment();
  dome.preferences.editorType = "windows";
  dome.setupEditorSupport();

  const e1 = { focusCalled: false, focus() { this.focusCalled = true; }, close() {} };
  const e2 = { focusCalled: false, closeCalled: false, focus() { this.focusCalled = true; }, close() { this.closeCalled = true; } };
  const proto = { Ghost: { focus() {}, close() {} } };
  dome.spawned = Object.create(proto);
  dome.spawned.Editor1 = e1;
  dome.spawned.Editor2 = e2;

  dome.updateEditorListView();

  dome.editorListView.dispatchEvent(new window.Event("click"));

  const expected = "<ul><li data-editor=\"Editor1\"><span data-editor=\"Editor1\" class=\"truncate\" title=\"Editor1\">Editor1</span><a data-editor=\"Editor1\" title=\"close editor\" href=\"javascript:void(0);\"><i data-editor=\"Editor1\" class=\"glyph-button-close\"></i></a></li><li data-editor=\"Editor2\"><span data-editor=\"Editor2\" class=\"truncate\" title=\"Editor2\">Editor2</span><a data-editor=\"Editor2\" title=\"close editor\" href=\"javascript:void(0);\"><i data-editor=\"Editor2\" class=\"glyph-button-close\"></i></a></li></ul>";
  assert.equal(dome.editorListView.innerHTML, expected);

  const span1 = dome.editorListView.querySelector("span[data-editor=\"Editor1\"]");
  span1.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(e1.focusCalled, true);

  const icon2 = dome.editorListView.querySelector("i[data-editor=\"Editor2\"]");
  icon2.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(e2.closeCalled, true);
  assert.ok(!("Editor2" in dome.spawned));

  const expectedAfter = "<ul><li data-editor=\"Editor1\"><span data-editor=\"Editor1\" class=\"truncate\" title=\"Editor1\">Editor1</span><a data-editor=\"Editor1\" title=\"close editor\" href=\"javascript:void(0);\"><i data-editor=\"Editor1\" class=\"glyph-button-close\"></i></a></li></ul>";
  assert.equal(dome.editorListView.innerHTML, expectedAfter);

  dome.editorClosed("Editor1");
  assert.equal(dome.editorListView.innerHTML, "");
  assert.equal(Object.keys(dome.spawned).length, 0);
});

test("editor window notifies parent via message and unload", () => {
  resetEnvironment();
  dome.preferences.editorType = "windows";
  dome.setupEditorSupport();

  let openArgs = null;
  const childDom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  const childWin = childDom.window;
  childWin.focus = () => {};
  window.open = (url, name, config) => {
    openArgs = { url, name, config };
    return childWin;
  };

  const editor = { editorName: "Editor1", uploadCommand: "@something", buffer: "text" };
  dome.spawned[editor.editorName] = dome.makeEditor(editor);

  assert.ok(openArgs.url.startsWith("/editor/basic/?et=dark&ts="));
  assert.equal(openArgs.name, "Editor1");
  assert.equal(openArgs.config, "width=640,height=480,resizeable,scrollbars");
  assert.ok("Editor1" in dome.spawned);

  window.dispatchEvent(new window.MessageEvent("message", { data: { type: "editorClosed", editorName: "Editor1" } }));
  assert.ok(!("Editor1" in dome.spawned));

  dome.spawned[editor.editorName] = dome.makeEditor(editor);
  assert.ok("Editor1" in dome.spawned);

  childWin.dispatchEvent(new childWin.Event("beforeunload"));
  assert.ok(!("Editor1" in dome.spawned));
});

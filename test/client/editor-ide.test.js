import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import esbuild from "esbuild";
import setupDom from "../../test-support/setup-dom.js";

const aceStub = `
const ace = {
  config: {
    set() {},
    setModuleUrl() {}
  },
  require() {
    return {
      CodeMirror: {
        Vim: {
          defineEx() {}
        }
      }
    };
  },
  edit(node) {
    const editor = createEditor(node);
    globalThis.__editorIdeAceEditors.push(editor);
    return editor;
  }
};

function createEditor(node) {
  let value = "";
  const handlers = {};
  const options = {};
  const session = {
    mode: "",
    useWrapMode: false,
    setMode(nextMode) {
      this.mode = nextMode;
    },
    setUseWrapMode(nextWrapMode) {
      this.useWrapMode = nextWrapMode;
    },
    getLength() {
      return value.split("\\n").length;
    },
    getLine(row) {
      return value.split("\\n")[row] || "";
    }
  };

  return {
    node,
    handlers,
    options,
    session,
    keyboardHandler: "",
    destroyed: false,
    resizeCalls: 0,
    renderer: {
      updateFull() {}
    },
    setTheme(theme) {
      this.theme = theme;
    },
    getSession() {
      return session;
    },
    setKeyboardHandler(handler) {
      this.keyboardHandler = handler;
    },
    setOption(key, optionValue) {
      options[key] = optionValue;
    },
    setValue(nextValue) {
      value = String(nextValue ?? "");
    },
    getValue() {
      return value;
    },
    setTestValue(nextValue) {
      value = String(nextValue ?? "");
      handlers.change?.();
    },
    on(eventName, handler) {
      handlers[eventName] = handler;
    },
    emitEditorEvent(eventName, event) {
      handlers[eventName]?.(event);
    },
    undo() {},
    getCursorPosition() {
      return { row: 0, column: 0 };
    },
    moveCursorTo() {},
    clearSelection() {},
    resize() {
      this.resizeCalls += 1;
    },
    destroy() {
      this.destroyed = true;
    }
  };
}

export default ace;
`;

async function buildEditorIdeBundle(t) {
  const tmpDir = await fs.mkdtemp(path.resolve(".editor-ide-test-"));
  const outfile = path.join(tmpDir, "EditorIDE.bundle.mjs");
  await esbuild.build({
    entryPoints: [path.resolve("src/client/features/editor/react/EditorIDE.jsx")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    external: ["react"],
    plugins: [
      {
        name: "editor-ide-test-stubs",
        setup(build) {
          build.onResolve({ filter: /^ace-builds\/src-noconflict\/ace\.js$/ }, () => ({
            path: "ace",
            namespace: "editor-ide-stub"
          }));
          build.onResolve({ filter: /^ace-builds\/src-noconflict\// }, () => ({
            path: "empty",
            namespace: "editor-ide-stub"
          }));
          build.onResolve({ filter: /(^|\/)(keybinding-vim|mode-moo|fonts)\.js$/ }, (args) => ({
            path: args.path.endsWith("fonts.js") ? "fonts" : "empty",
            namespace: "editor-ide-stub"
          }));
          build.onResolve({ filter: /(^|\/)editor-support\.js$/ }, () => ({
            path: "socket",
            namespace: "editor-ide-stub"
          }));
          build.onLoad({ filter: /.*/, namespace: "editor-ide-stub" }, (args) => {
            if (args.path === "ace") {
              return { contents: aceStub, loader: "js" };
            }
            if (args.path === "fonts") {
              return {
                contents: "export function getPreferredFont() { return \"standard\"; } export function getFontFamily() { return \"monospace\"; }",
                loader: "js"
              };
            }
            if (args.path === "socket") {
              return {
                contents: "export function getSocket() { return globalThis.__editorIdeSocket || null; }",
                loader: "js"
              };
            }
            return { contents: "", loader: "js" };
          });
        }
      }
    ]
  });
  t.after(async () => {
    await fs.rm(tmpDir, { force: true, recursive: true });
  });
  return `${pathToFileURL(outfile).href}?cache=${Date.now()}-${Math.random()}`;
}

function setupEditorDom(attributes = {}) {
  const dataAttrs = {
    "data-editor-theme": "tomorrow_night_blue",
    "data-local-save-node-max-lines": "200",
    "data-local-save-node-admin-max-lines": "800",
    "data-local-save-note-max-lines": "20",
    "data-ide-edit-open-parent": "false",
    "data-ide-vms-note-enabled": "false",
    "data-ide-object-browser-enabled": "true",
    "data-ide-property-browser-enabled": "true",
    "data-ide-hover-overlays-enabled": "true",
    "data-ide-reference-navigation-enabled": "true",
    "data-ide-scratch-enabled": "true",
    "data-editor-parser": "",
    ...attributes
  };
  const attrText = Object.entries(dataAttrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  const dom = setupDom(null, `<!doctype html><html><body><div id="root" ${attrText}></div></body></html>`);
  dom.window.HTMLElement.prototype.attachEvent = () => {};
  dom.window.HTMLElement.prototype.detachEvent = () => {};
  return dom;
}

async function waitFor(assertion, { timeoutMs = 1500, intervalMs = 10 } = {}) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw lastError;
}

async function renderEditorIde(t, attributes = {}) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__editorIdeAceEditors = [];
  const emit = t.mock.fn();
  globalThis.__editorIdeSocket = { emit };
  const { window, cleanup } = setupEditorDom(attributes);
  const moduleUrl = await buildEditorIdeBundle(t);
  const { default: EditorIDE } = await import(moduleUrl);
  const rootElement = window.document.getElementById("root");
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(React.createElement(EditorIDE));
  });

  t.after(async () => {
    await act(async () => {
      root.unmount();
    });
    delete globalThis.__editorIdeAceEditors;
    delete globalThis.__editorIdeSocket;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });

  return { window, rootElement, emit };
}

async function postIdeMessage(window, data) {
  await act(async () => {
    window.dispatchEvent(new window.MessageEvent("message", { data }));
  });
}

async function click(window, element) {
  assert.ok(element, "Expected element to click");
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

async function keydown(window, key, options = {}) {
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options
    }));
  });
}

function getTabs(window) {
  return Array.from(window.document.querySelectorAll("[role='tab']")).map((tab) => tab.getAttribute("title"));
}

function getButtonByText(window, text) {
  return Array.from(window.document.querySelectorAll("button")).find((button) =>
    button.textContent.trim() === text
  );
}

async function openTab(window, editor) {
  await postIdeMessage(window, { type: "ide-open-tab", editor });
  await waitFor(() => {
    assert.ok(globalThis.__editorIdeAceEditors.length > 0);
    assert.ok(getTabs(window).includes(editor.editorName));
  });
}

test("EditorIDE pins browser tabs and saves an editable program tab", async (t) => {
  const { window, emit } = await renderEditorIde(t);

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });

  assert.deepEqual(getTabs(window), ["Object Browser", "Look"]);
  assert.match(window.document.body.textContent, /Saved/);

  await click(window, getButtonByText(window, "Save"));

  assert.deepEqual(emit.mock.calls.map((call) => call.arguments), [
    ["input", "@program #12:look"],
    ["input", "initial\n."]
  ]);
});

test("EditorIDE applies MOO mode when configured", async (t) => {
  const rendered = await renderEditorIde(t, { "data-editor-parser": "MOO" });
  await openTab(rendered.window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });
  assert.equal(globalThis.__editorIdeAceEditors[0].session.mode, "ace/mode/moo");
  assert.equal(globalThis.__editorIdeAceEditors[0].options.tabSize, 2);
});

test("EditorIDE falls back to text mode for unsupported parser values", async (t) => {
  const rendered = await renderEditorIde(t, { "data-editor-parser": "python" });
  await openTab(rendered.window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });
  assert.equal(globalThis.__editorIdeAceEditors[0].session.mode, "ace/mode/text");
});

test("EditorIDE reuses duplicate tabs without replacing contents", async (t) => {
  const { window, emit } = await renderEditorIde(t);

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });
  await postIdeMessage(window, {
    type: "ide-open-tab",
    editor: {
      editorName: "Look",
      uploadCommand: "@program #12:look",
      buffer: "replacement"
    }
  });

  assert.deepEqual(getTabs(window), ["Object Browser", "Look"]);
  assert.equal(globalThis.__editorIdeAceEditors[0].getValue(), "initial");
  assert.deepEqual(emit.mock.calls.at(-1).arguments, [
    "input",
    "@@editor-message There was already a tab with that information open so we have switched the view to that. We did not update the contents."
  ]);
});

test("EditorIDE pins the property browser before editable property tabs", async (t) => {
  const { window } = await renderEditorIde(t);

  await openTab(window, {
    editorName: "Name",
    uploadCommand: "@edit #12.name",
    buffer: "old name"
  });

  assert.deepEqual(getTabs(window), ["Property Browser", "Name"]);
  assert.doesNotMatch(window.document.querySelector("[role='tab']").textContent, /Saved|Unsaved/);
});

test("EditorIDE does not pin browser tabs when browser features are disabled", async (t) => {
  const { window } = await renderEditorIde(t, {
    "data-ide-object-browser-enabled": "false",
    "data-ide-property-browser-enabled": "false"
  });

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });
  assert.deepEqual(getTabs(window), ["Look"]);

  await openTab(window, {
    editorName: "Name",
    uploadCommand: "@edit #12.name",
    buffer: "old name"
  });
  assert.deepEqual(getTabs(window), ["Look", "Name"]);
});

test("EditorIDE closes browser panels without destroying editable documents", async (t) => {
  const { window, emit } = await renderEditorIde(t);

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });
  await click(window, window.document.querySelector("button[aria-label='Close Object Browser']"));

  assert.deepEqual(getTabs(window), ["Look"]);
  assert.equal(globalThis.__editorIdeAceEditors[0].destroyed, false);

  await click(window, getButtonByText(window, "Save"));

  assert.deepEqual(emit.mock.calls.slice(-2).map((call) => call.arguments), [
    ["input", "@program #12:look"],
    ["input", "initial\n."]
  ]);
});

test("EditorIDE closes the window when only browser panels remain", async (t) => {
  const { window } = await renderEditorIde(t);
  let closeCalls = 0;
  window.close = () => {
    closeCalls += 1;
  };

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });
  await click(window, getButtonByText(window, "Close"));

  await waitFor(() => {
    assert.equal(closeCalls, 1);
  });
});

test("EditorIDE does not close the window while editable tabs remain", async (t) => {
  const { window } = await renderEditorIde(t);
  let closeCalls = 0;
  window.close = () => {
    closeCalls += 1;
  };

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });
  await openTab(window, {
    editorName: "Tell",
    uploadCommand: "@program #12:tell",
    buffer: "second"
  });
  await click(window, getButtonByText(window, "Close"));

  assert.equal(closeCalls, 0);
  assert.deepEqual(getTabs(window), ["Object Browser", "Look"]);
});

test("EditorIDE prompts for VMS notes before saving program tabs when enabled", async (t) => {
  const { window, emit } = await renderEditorIde(t, { "data-ide-vms-note-enabled": "true" });

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });
  await click(window, getButtonByText(window, "Save"));

  assert.equal(emit.mock.calls.length, 0);
  assert.match(window.document.body.textContent, /VMS Save Note/);

  const input = window.document.querySelector("input[aria-label='VMS note prompt input']");
  await act(async () => {
    const propsKey = Object.keys(input).find((key) => key.startsWith("__reactProps$"));
    input[propsKey].onChange({ target: { value: "changed look behavior" } });
  });
  await click(window, getButtonByText(window, "Submit"));

  assert.deepEqual(emit.mock.calls.map((call) => call.arguments), [
    ["input", "@program #12:look"],
    ["input", "initial\n."],
    ["input", "changed look behavior"]
  ]);
});

test("EditorIDE hides scratch actions when scratch support is disabled", async (t) => {
  const { window } = await renderEditorIde(t, { "data-ide-scratch-enabled": "false" });

  assert.equal(getButtonByText(window, "Add Scratch"), undefined);
  assert.equal(getButtonByText(window, "View Scratch"), undefined);
});

test("EditorIDE keeps an empty VMS note field visible until blur", async (t) => {
  const { window } = await renderEditorIde(t, { "data-ide-vms-note-enabled": "true" });

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });
  await click(window, getButtonByText(window, "Save"));

  const promptInput = window.document.querySelector("input[aria-label='VMS note prompt input']");
  await act(async () => {
    const propsKey = Object.keys(promptInput).find((key) => key.startsWith("__reactProps$"));
    promptInput[propsKey].onChange({ target: { value: "changed look behavior" } });
  });
  await click(window, getButtonByText(window, "Submit"));

  const noteInput = window.document.querySelector("input[aria-label='VMS note']");
  assert.ok(noteInput);
  await act(async () => {
    const propsKey = Object.keys(noteInput).find((key) => key.startsWith("__reactProps$"));
    noteInput[propsKey].onFocus();
    noteInput[propsKey].onChange({ target: { value: "" } });
  });

  const emptyNoteInput = window.document.querySelector("input[aria-label='VMS note']");
  assert.ok(emptyNoteInput);
  await act(async () => {
    const propsKey = Object.keys(emptyNoteInput).find((key) => key.startsWith("__reactProps$"));
    emptyNoteInput[propsKey].onBlur();
  });

  assert.equal(window.document.querySelector("input[aria-label='VMS note']"), null);
});

test("EditorIDE keyboard shortcuts preserve current editor behavior", async (t) => {
  const { window, emit } = await renderEditorIde(t, { "data-editor-parser": "moo" });

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "initial"
  });
  const editor = globalThis.__editorIdeAceEditors[0];
  assert.equal(editor.options.tabSize, 2);
  assert.equal(editor.options.useSoftTabs, true);

  await keydown(window, "1", { ctrlKey: true });
  assert.equal(editor.keyboardHandler, "ace/keyboard/vim");

  await keydown(window, "0", { ctrlKey: true });
  assert.equal(editor.keyboardHandler, "");

  await keydown(window, "L", { ctrlKey: true, shiftKey: true });
  assert.equal(editor.session.useWrapMode, true);

  await keydown(window, "s", { ctrlKey: true });
  assert.deepEqual(emit.mock.calls.slice(-2).map((call) => call.arguments), [
    ["input", "@program #12:look"],
    ["input", "initial\n."]
  ]);
});

test("EditorIDE renders shortcut overlay when bundled with the production JSX runtime", async (t) => {
  const { window } = await renderEditorIde(t);

  await keydown(window, "/", { ctrlKey: true });

  assert.match(window.document.body.textContent, /Editor Shortcuts/);
  assert.match(window.document.body.textContent, /Save tab/);
  assert.match(window.document.body.textContent, /Edit Verb \/ Prop/);
});

test("EditorIDE defaults to dark mode without a saved preference", async (t) => {
  const { window } = await renderEditorIde(t);

  assert.equal(window.document.documentElement.classList.contains("dark"), true);
});

test("EditorIDE hides reference navigation shortcut when disabled", async (t) => {
  const { window } = await renderEditorIde(t, {
    "data-ide-reference-navigation-enabled": "false"
  });

  await keydown(window, "/", { ctrlKey: true });

  assert.match(window.document.body.textContent, /Editor Shortcuts/);
  assert.match(window.document.body.textContent, /Save tab/);
  assert.doesNotMatch(window.document.body.textContent, /Edit Verb \/ Prop/);
  assert.doesNotMatch(window.document.body.textContent, /Ctrl Click ref/);
});

test("EditorIDE hover overlays request and reuse cached SDWC payloads", async (t) => {
  const { window, emit } = await renderEditorIde(t);

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "return this:foo();"
  });
  const editor = globalThis.__editorIdeAceEditors[0];

  await act(async () => {
    editor.emitEditorEvent("mousemove", {
      getDocumentPosition: () => ({ row: 0, column: 13 }),
      domEvent: { clientX: 10, clientY: 20 }
    });
  });

  assert.deepEqual(emit.mock.calls.at(-1).arguments, [
    "input",
    "#$# SDWC%%VERB-OVERLAY%%#12%%foo"
  ]);

  await postIdeMessage(window, {
    type: "ide-verb-overlay",
    objectId: "#12",
    verbName: "foo",
    payload: {
      object: "#12",
      verb: "foo",
      value: ["line one", "line two"]
    }
  });
  await act(async () => {
    editor.emitEditorEvent("mouseout");
    editor.emitEditorEvent("mousemove", {
      getDocumentPosition: () => ({ row: 0, column: 13 }),
      domEvent: { clientX: 30, clientY: 40 }
    });
  });

  const overlayRequests = emit.mock.calls.filter((call) =>
    String(call.arguments[1]).includes("SDWC%%VERB-OVERLAY")
  );
  assert.equal(overlayRequests.length, 1);
  assert.match(window.document.body.textContent, /line one\s+line two/);
});

test("EditorIDE does not request hover overlays when disabled", async (t) => {
  const { window, emit } = await renderEditorIde(t, {
    "data-ide-hover-overlays-enabled": "false"
  });

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "return this:foo();"
  });
  const editor = globalThis.__editorIdeAceEditors[0];

  await act(async () => {
    editor.emitEditorEvent("mousemove", {
      getDocumentPosition: () => ({ row: 0, column: 13 }),
      domEvent: { clientX: 10, clientY: 20 }
    });
  });

  assert.equal(emit.mock.calls.length, 0);
  assert.equal(window.document.querySelector(".sdwc-hover-overlay"), null);
});

test("EditorIDE Ctrl/Cmd-click reference navigation emits edit commands by default", async (t) => {
  const { window, emit } = await renderEditorIde(t);

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "return this:foo();"
  });
  await act(async () => {
    globalThis.__editorIdeAceEditors[0].emitEditorEvent("click", {
      getDocumentPosition: () => ({ row: 0, column: 13 }),
      domEvent: {
        ctrlKey: true,
        preventDefault() {},
        stopPropagation() {}
      }
    });
  });
  assert.deepEqual(emit.mock.calls.at(-1).arguments, ["input", "@edit #12:foo"]);
});

test("EditorIDE disables Ctrl/Cmd-click reference navigation when configured", async (t) => {
  const { window, emit } = await renderEditorIde(t, {
    "data-ide-reference-navigation-enabled": "false"
  });

  await openTab(window, {
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "return this:foo();"
  });
  await act(async () => {
    globalThis.__editorIdeAceEditors.at(-1).emitEditorEvent("click", {
      getDocumentPosition: () => ({ row: 0, column: 13 }),
      domEvent: {
        ctrlKey: true,
        preventDefault() {},
        stopPropagation() {}
      }
    });
  });
  assert.equal(emit.mock.calls.length, 0);
});

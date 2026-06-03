import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import setupDom from "../../test-support/setup-dom.js";
import { emitInput } from "../../src/client/features/editor/react/editor-ide/socketAdapter.js";
import { useIdeConfig } from "../../src/client/features/editor/react/editor-ide/useIdeConfig.js";
import { useIdeMessages } from "../../src/client/features/editor/react/editor-ide/useIdeMessages.js";
import { useIdeSaveFlow } from "../../src/client/features/editor/react/editor-ide/useIdeSaveFlow.js";
import { useIdeKeyboardShortcuts } from "../../src/client/features/editor/react/editor-ide/useIdeKeyboardShortcuts.js";
import { useIdeBrowserCommands } from "../../src/client/features/editor/react/editor-ide/useIdeBrowserCommands.js";
import { usePersistentPreference } from "../../src/client/features/editor/react/editor-ide/usePersistentPreference.js";

test("useIdeConfig reads root data attributes with defaults", () => {
  const { cleanup } = setupDom(null, `<!doctype html><html><body><div
    id="root"
    data-editor-theme="tomorrow_night_blue"
    data-local-save-node-max-lines="300"
    data-local-save-node-admin-max-lines="900"
    data-local-save-note-max-lines="30"
    data-ide-edit-open-parent="true"
    data-ide-vms-note-enabled="true"
  ></div></body></html>`);
  try {
    assert.deepEqual(useIdeConfig(), {
      editorTheme: "tomorrow_night_blue",
      localSaveNodeMaxLines: 300,
      localSaveNodeAdminMaxLines: 900,
      localSaveNoteMaxLines: 30,
      ideEditOpenParent: true,
      ideVmsNoteEnabled: true
    });
  } finally {
    cleanup();
  }
});

test("useIdeConfig falls back to defaults when document is unavailable", () => {
  const previousDocument = globalThis.document;
  try {
    delete globalThis.document;
    assert.deepEqual(useIdeConfig(), {
      editorTheme: "twilight",
      localSaveNodeMaxLines: 200,
      localSaveNodeAdminMaxLines: 800,
      localSaveNoteMaxLines: 20,
      ideEditOpenParent: false,
      ideVmsNoteEnabled: false
    });
  } finally {
    globalThis.document = previousDocument;
  }
});

test("usePersistentPreference initializes and writes local storage values", async (t) => {
  const { window, localStorage, cleanup } = setupDom();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.after(() => {
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });

  localStorage.getItem = (key) => (key === "ide-dark" ? "true" : null);
  const stored = {};
  localStorage.setItem = (key, value) => {
    stored[key] = value;
  };
  let setPreference;

  function PreferenceHarness() {
    const [enabled, setEnabled] = usePersistentPreference(
      "ide-dark",
      false,
      (value) => value === "true"
    );
    setPreference = setEnabled;
    return React.createElement("button", { type: "button" }, enabled ? "dark" : "light");
  }

  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(PreferenceHarness));
  });
  assert.equal(container.textContent, "dark");

  await act(async () => {
    setPreference((currentValue) => !currentValue);
  });
  assert.equal(container.textContent, "light");
  assert.equal(stored["ide-dark"], "false");

  await act(async () => {
    root.unmount();
  });
});

test("useIdeMessages routes IDE postMessage events and announces readiness", async (t) => {
  const { window, cleanup } = setupDom();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.after(() => {
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });

  const calls = [];
  window.opener = {
    postMessage(message, targetOrigin) {
      calls.push(["ready", message, targetOrigin]);
    }
  };

  function MessageHarness() {
    const [font, setFont] = useState("");
    useIdeMessages({
      addTab: (editor) => calls.push(["tab", editor]),
      applyObjectPropsPayload: (payload) => calls.push(["props", payload]),
      applyObjectVerbsPayload: (payload) => calls.push(["verbs", payload]),
      handlePropOverlayPayload: (payload) => calls.push(["prop-overlay", payload]),
      handleVerbOverlayPayload: (payload) => calls.push(["verb-overlay", payload]),
      setEditorFont: (nextFont) => {
        setFont(nextFont);
        calls.push(["font", nextFont]);
      }
    });
    return React.createElement("span", null, font);
  }

  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(MessageHarness));
  });
  assert.deepEqual(calls.shift(), ["ready", { type: "ide-ready" }, "*"]);

  await act(async () => {
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-open-tab", editor: { editorName: "Look" } }
    }));
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-object-verbs", payload: ["#1", []] }
    }));
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-object-props", payload: ["#1", []] }
    }));
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-verb-overlay", objectId: "#1", verbName: "look" }
    }));
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-prop-overlay", objectId: "#1", propertyName: "name" }
    }));
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-set-font", font: "large" }
    }));
  });

  assert.deepEqual(calls, [
    ["tab", { editorName: "Look" }],
    ["verbs", ["#1", []]],
    ["props", ["#1", []]],
    ["verb-overlay", { type: "ide-verb-overlay", objectId: "#1", verbName: "look" }],
    ["prop-overlay", { type: "ide-prop-overlay", objectId: "#1", propertyName: "name" }],
    ["font", "large"]
  ]);
  assert.equal(container.textContent, "large");

  await act(async () => {
    root.unmount();
  });
});

test("useIdeMessages ignores malformed messages and unavailable opener postMessage", async (t) => {
  const { window, cleanup } = setupDom();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.after(() => {
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });

  const calls = [];
  window.opener = { postMessage: "unavailable" };

  function MessageHarness() {
    useIdeMessages({
      addTab: (editor) => calls.push(["tab", editor]),
      applyObjectPropsPayload: (payload) => calls.push(["props", payload]),
      applyObjectVerbsPayload: (payload) => calls.push(["verbs", payload]),
      handlePropOverlayPayload: (payload) => calls.push(["prop-overlay", payload]),
      handleVerbOverlayPayload: (payload) => calls.push(["verb-overlay", payload]),
      setEditorFont: (font) => calls.push(["font", font])
    });
    return React.createElement("span", null, "ready");
  }

  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(MessageHarness));
  });

  await act(async () => {
    window.dispatchEvent(new window.MessageEvent("message", { data: null }));
    window.dispatchEvent(new window.MessageEvent("message", { data: [] }));
    window.dispatchEvent(new window.MessageEvent("message", { data: { type: 7 } }));
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-open-tab", editor: null }
    }));
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-set-font", font: 12 }
    }));
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-set-font", font: "standard" }
    }));
  });

  assert.deepEqual(calls, [["font", "standard"]]);

  await act(async () => {
    root.unmount();
  });
});

test("useIdeSaveFlow prompts, submits, cancels, and preserves failed saves", async (t) => {
  const { window, cleanup } = setupDom();
  window.HTMLElement.prototype.attachEvent = () => {};
  window.HTMLElement.prototype.detachEvent = () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.after(() => {
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });

  const dispatches = [];
  const messages = [];
  let controls;
  let emitResult = true;
  const tabs = [{
    id: 3,
    command: "@program",
    commandTarget: "#12:look",
    uploadCommand: "@program #12:look",
    vmsNote: ""
  }];

  function SaveHarness() {
    controls = useIdeSaveFlow({
      active: 3,
      dispatchIde: (action) => dispatches.push(action),
      emitInput: (message) => {
        messages.push(message);
        return emitResult;
      },
      getEditorValue: () => "content",
      ideVmsNoteEnabled: true,
      tabs
    });
    return React.createElement("input", { ref: controls.vmsPromptInputRef });
  }

  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(SaveHarness));
  });

  await act(async () => {
    controls.onSave();
  });
  assert.deepEqual(controls.vmsPrompt, { open: true, tabId: 3, value: "" });
  assert.deepEqual(messages, []);

  await act(async () => {
    controls.setVmsPromptValue("changed look behavior");
  });
  await act(async () => {
    controls.submitVmsPrompt();
  });
  assert.deepEqual(messages, [
    "@program #12:look",
    "content\n.",
    "changed look behavior"
  ]);
  assert.deepEqual(dispatches, [
    { type: "markDocumentSaved", id: 3, content: "content" },
    { type: "updateVmsNote", id: 3, vmsNote: "changed look behavior" }
  ]);
  assert.deepEqual(controls.vmsPrompt, { open: false, tabId: null, value: "" });

  await act(async () => {
    controls.onSave();
  });
  await act(async () => {
    controls.cancelVmsPrompt();
  });
  assert.deepEqual(controls.vmsPrompt, { open: false, tabId: null, value: "" });

  emitResult = false;
  messages.length = 0;
  dispatches.length = 0;
  await act(async () => {
    controls.onSave();
  });
  await act(async () => {
    controls.setVmsPromptValue("failed note");
  });
  await act(async () => {
    controls.submitVmsPrompt();
  });
  assert.deepEqual(messages, ["@program #12:look"]);
  assert.deepEqual(dispatches, []);
  assert.deepEqual(controls.vmsPrompt, { open: true, tabId: 3, value: "failed note" });

  await act(async () => {
    root.unmount();
  });
});

test("useIdeKeyboardShortcuts routes keydown commands", async (t) => {
  const { window, cleanup } = setupDom();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.after(() => {
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });

  const calls = [];
  let closeCalls = 0;
  window.close = () => {
    closeCalls += 1;
  };

  function ShortcutHarness({ active = 2, showShortcuts = false, vmsPrompt = { open: false } }) {
    const [vimMode, setVimMode] = useState(false);
    useIdeKeyboardShortcuts({
      active,
      activateTab: (id) => calls.push(["activate", id]),
      cancelVmsPrompt: () => calls.push(["cancel-vms"]),
      onClose: (id) => calls.push(["close", id]),
      onSave: () => calls.push(["save"]),
      orientation: "top",
      setOrientationPersist: (orientation) => calls.push(["orientation", orientation]),
      setShowShortcuts: (value) => calls.push(["shortcuts", typeof value === "function" ? value(false) : value]),
      setVimMode: (value) => {
        setVimMode(value);
        calls.push(["vim", value]);
      },
      showShortcuts,
      submitVmsPrompt: () => calls.push(["submit-vms"]),
      tabs: [
        { id: 1, commandTarget: "#1:a" },
        { id: 2, commandTarget: "#1:b" },
        { id: 3, commandTarget: "#1:c" }
      ],
      toggleWordWrap: () => calls.push(["wrap"]),
      vmsPrompt
    });
    return React.createElement("span", null, vimMode ? "vim" : "normal");
  }

  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(ShortcutHarness));
  });

  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "e", ctrlKey: true }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "[", ctrlKey: true }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "]", ctrlKey: true }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "1", ctrlKey: true }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "0", ctrlKey: true }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "L", ctrlKey: true, shiftKey: true }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "X", ctrlKey: true, shiftKey: true }));
  });
  assert.deepEqual(calls, [
    ["save"],
    ["close", 2],
    ["activate", 1],
    ["activate", 3],
    ["vim", true],
    ["vim", false],
    ["wrap"],
    ["orientation", "left"]
  ]);

  calls.length = 0;
  await act(async () => {
    root.render(React.createElement(ShortcutHarness, { vmsPrompt: { open: true } }));
  });
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
  });
  assert.deepEqual(calls, [["cancel-vms"], ["submit-vms"]]);

  calls.length = 0;
  await act(async () => {
    root.render(React.createElement(ShortcutHarness, { showShortcuts: true }));
  });
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  });
  assert.deepEqual(calls, [["shortcuts", false]]);

  calls.length = 0;
  await act(async () => {
    root.render(React.createElement(ShortcutHarness, { active: null }));
  });
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "e", ctrlKey: true }));
  });
  assert.equal(closeCalls, 1);
  assert.deepEqual(calls, []);

  await act(async () => {
    root.unmount();
  });
});

test("useIdeBrowserCommands dispatches browser state and emits protocol commands", async (t) => {
  const { window, cleanup } = setupDom();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.after(() => {
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });

  const dispatches = [];
  const messages = [];
  let commands;

  function BrowserCommandHarness() {
    commands = useIdeBrowserCommands({
      dispatchIde: (action) => dispatches.push(action),
      emitInput: (message) => messages.push(message)
    });
    return React.createElement("span", null, "ready");
  }

  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(BrowserCommandHarness));
  });

  await act(async () => {
    commands.onLoadVerbs("#12");
    commands.onLoadProps("#12");
    commands.onEditVerb("#12", "look* tell");
    commands.onEditProperty("#12", "name aliases");
    commands.toggleObjectCollapsed("#12");
    commands.togglePropertyCollapsed("#12");
  });

  assert.deepEqual(dispatches, [
    { type: "loadObjectVerbs", objectId: "#12" },
    { type: "loadObjectProperties", objectId: "#12" },
    { type: "toggleObjectCollapsed", objectId: "#12" },
    { type: "togglePropertyCollapsed", objectId: "#12" }
  ]);
  assert.deepEqual(messages, [
    "#$# SDWC%%VERBS%%#12",
    "#$# SDWC%%PROPS%%#12",
    "@edit #12:look",
    "@edit #12.name"
  ]);

  await act(async () => {
    root.unmount();
  });
});

test("emitInput ignores unavailable sockets and malformed socket adapters", () => {
  const previousWindowSocket = globalThis.window.uploadSocket;
  try {
    delete globalThis.window.uploadSocket;
    assert.equal(emitInput("look"), false);

    globalThis.window.uploadSocket = {};
    assert.equal(emitInput("look"), false);

    const emitted = [];
    globalThis.window.uploadSocket = {
      emit(eventName, message) {
        emitted.push([eventName, message]);
      }
    };
    assert.equal(emitInput("look"), true);
    assert.deepEqual(emitted, [["input", "look"]]);
  } finally {
    globalThis.window.uploadSocket = previousWindowSocket;
  }
});

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
import { useRecentTabs } from "../../src/client/features/editor/react/editor-ide/useRecentTabs.js";

test("useIdeConfig reads root data attributes with defaults", () => {
  const { cleanup } = setupDom(null, `<!doctype html><html><body><div
    id="root"
    data-editor-theme="tomorrow_night_blue"
    data-local-save-node-max-lines="300"
    data-local-save-node-admin-max-lines="900"
    data-local-save-note-max-lines="30"
    data-ide-edit-open-parent="true"
    data-ide-vms-note-enabled="true"
    data-ide-object-browser-enabled="false"
    data-ide-property-browser-enabled="false"
    data-ide-hover-overlays-enabled="false"
    data-ide-reference-navigation-enabled="false"
    data-ide-scratch-enabled="false"
    data-editor-parser="MOO"
    data-editor-parser-block-save="true"
  ></div></body></html>`);
  try {
    assert.deepEqual(useIdeConfig(), {
      editorTheme: "tomorrow_night_blue",
      localSaveNodeMaxLines: 300,
      localSaveNodeAdminMaxLines: 900,
      localSaveNoteMaxLines: 30,
      ideEditOpenParent: true,
      ideVmsNoteEnabled: true,
      ideObjectBrowserEnabled: false,
      idePropertyBrowserEnabled: false,
      ideHoverOverlaysEnabled: false,
      ideReferenceNavigationEnabled: false,
      ideScratchEnabled: false,
      editorParser: "MOO",
      editorParserBlockSave: true
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
      ideVmsNoteEnabled: false,
      ideObjectBrowserEnabled: true,
      idePropertyBrowserEnabled: true,
      ideHoverOverlaysEnabled: true,
      ideReferenceNavigationEnabled: true,
      ideScratchEnabled: true,
      editorParser: "",
      editorParserBlockSave: false
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
      data: { type: "ide-open-tab", editor: "invalid" }
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

test("IDE scratchpad messages require the current same-origin opener", async (t) => {
  const { window, cleanup } = setupDom();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(window.document.body.appendChild(window.document.createElement("div")));
  t.after(async () => {
    await act(async () => root.unmount());
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });

  const status = t.mock.fn();
  const addTab = t.mock.fn();
  const opener = window.document.body.appendChild(window.document.createElement("iframe")).contentWindow;
  window.opener = opener;
  t.mock.method(opener, "postMessage", status);
  const origin = window.location.origin;

  function ScratchpadHarness() {
    useIdeMessages({ addTab });
    return null;
  }

  await act(async () => root.render(React.createElement(ScratchpadHarness)));
  assert.deepEqual(status.mock.calls[0].arguments, [{ type: "ide-ready" }, "*"]);

  const editor = { contextScratch: true, buffer: "Selected output" };
  const send = (source, origin) => {
    window.dispatchEvent(new window.MessageEvent("message", {
      data: { type: "ide-open-tab", editor },
      source,
      origin
    }));
  };

  send(window, origin);
  send(opener, "https://example.invalid");
  window.opener = null;
  send(null, origin);
  assert.equal(addTab.mock.callCount(), 0);

  window.opener = opener;
  send(opener, origin);
  assert.deepEqual(addTab.mock.calls.map(call => call.arguments), [[editor]]);
});

test("IDE messages use the latest handlers and are ignored after unmount", async (t) => {
  const { window, cleanup } = setupDom();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(window.document.body.appendChild(window.document.createElement("div")));
  t.after(() => {
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });

  const original = t.mock.fn();
  const latest = t.mock.fn();
  const errors = [];
  const ready = t.mock.fn();
  window.opener = { postMessage: ready };
  window.addEventListener("error", (event) => {
    errors.push(event.error);
    event.preventDefault();
  });

  function FontHarness({ setEditorFont }) {
    useIdeMessages({ setEditorFont });
    return null;
  }

  const send = (data) => window.dispatchEvent(new window.MessageEvent("message", { data }));
  await act(async () => root.render(React.createElement(FontHarness, { setEditorFont: original })));
  send({ type: "set-editor-font", font: "small" });

  await act(async () => root.render(React.createElement(FontHarness, { setEditorFont: latest })));
  const invalidArray = Object.assign([], { type: "ide-set-font", font: "ignored array" });
  for (const data of [false, "invalid", invalidArray, null, { type: "unknown", font: "ignored" }]) send(data);
  send({ type: "ide-set-font", font: "large" });

  await act(async () => root.unmount());
  send({ type: "set-editor-font", font: "ignored after close" });

  assert.deepEqual(errors, []);
  assert.equal(ready.mock.callCount(), 1);
  assert.deepEqual(original.mock.calls.map(call => call.arguments), [["small"]]);
  assert.deepEqual(latest.mock.calls.map(call => call.arguments), [["large"]]);
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

test("recent IDE tabs restore the most recently visited editor after removal", async (t) => {
  const { window, cleanup } = setupDom();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(window.document.body.appendChild(window.document.createElement("div")));
  t.after(async () => {
    await act(async () => root.unmount());
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });

  const dispatchIde = t.mock.fn();
  const first = { id: 1 };
  const second = { id: 2 };
  const third = { id: 3 };
  const all = [first, second, third];
  let getCloseState;
  function RecentTabsHarness({ active, tabs }) {
    ({ getCloseState } = useRecentTabs({ active, tabs, dispatchIde }));
    return null;
  }

  const render = async (active, tabs) => {
    await act(async () => root.render(React.createElement(RecentTabsHarness, { active, tabs })));
  };

  await render(null, all);
  await render(2, all);
  await render(1, all);
  await render(2, all);
  assert.equal(dispatchIde.mock.callCount(), 0);

  assert.deepEqual(getCloseState(3), {
    nextActiveId: 2,
    nextRecentTabIds: [1, 2],
    nextTabs: [first, second]
  });

  await render(2, [first, third]);
  assert.deepEqual(dispatchIde.mock.calls[0].arguments[0], { type: "activateTab", id: 1 });

  await render(1, [first, third]);
  assert.deepEqual(getCloseState(1), {
    nextActiveId: 3,
    nextRecentTabIds: [2],
    nextTabs: [third]
  });

  await render(3, [third]);
  assert.deepEqual(getCloseState(3), { nextActiveId: null, nextRecentTabIds: [2], nextTabs: [] });
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
    commands.onEditVerb("#12", " ");
    commands.onEditProperty("#12", " ");
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

test("the IDE can render and change settings when browser storage is unavailable", async (t) => {
  const { window, localStorage, cleanup } = setupDom();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.after(() => {
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    cleanup();
  });
  localStorage.getItem = () => { throw new Error("fixture storage is blocked"); };
  localStorage.setItem = () => { throw new Error("fixture storage is blocked"); };

  function PreferenceHarness() {
    const [orientation, setOrientation] = usePersistentPreference("ide-orientation", "top");
    return React.createElement("button", { onClick: () => setOrientation("left") }, orientation);
  }

  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(PreferenceHarness)));
    assert.equal(container.textContent, "top");
    await act(async () => container.querySelector("button").click());
    assert.equal(container.textContent, "left");
  } finally {
    await act(async () => root.unmount());
  }
});

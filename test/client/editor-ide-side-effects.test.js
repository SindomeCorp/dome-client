import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import setupDom from "../../test-support/setup-dom.js";
import { emitInput } from "../../src/client/react/editor-ide/socketAdapter.js";
import { useIdeConfig } from "../../src/client/react/editor-ide/useIdeConfig.js";
import { useIdeMessages } from "../../src/client/react/editor-ide/useIdeMessages.js";
import { usePersistentPreference } from "../../src/client/react/editor-ide/usePersistentPreference.js";

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

test("emitInput ignores unavailable sockets and malformed socket adapters", () => {
  const previousWindowSocket = globalThis.window.uploadSocket;
  const previousDomeSocket = globalThis.dome.socket;
  try {
    delete globalThis.window.uploadSocket;
    delete globalThis.dome.socket;
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
    globalThis.dome.socket = previousDomeSocket;
  }
});

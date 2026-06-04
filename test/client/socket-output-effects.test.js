import { test } from "node:test";
import assert from "node:assert/strict";
import { createSocketOutputEventHandler } from "../../src/client/features/terminal/socket-output-effects.js";

function createClient(t) {
  return {
    buffer: { childNodes: [] },
    health: { showStatus: t.mock.fn() },
    ideWindow: { closed: false, postMessage: t.mock.fn() },
    inputReader: {},
    makeEditor: t.mock.fn(() => ({ id: "editor" })),
    preferences: { commandSuggestions: true },
    setupAutoComplete: t.mock.fn(),
    spawned: {},
    updateEditorListView: t.mock.fn()
  };
}

function createLogger(t) {
  return {
    debug: t.mock.fn(),
    warn: t.mock.fn()
  };
}

function createRenderer(t) {
  return {
    appendOutputSegment: t.mock.fn(() => 1),
    endSdwcNowrapBlock: t.mock.fn(),
    startSdwcNowrapBlock: t.mock.fn()
  };
}

test("socket output event handler delegates text and fade events", (t) => {
  const client = createClient(t);
  const renderer = createRenderer(t);
  const handler = createSocketOutputEventHandler({
    client,
    logger: createLogger(t),
    renderer
  });

  assert.equal(handler({ type: "text", text: "line\n" }), 1);
  handler({ type: "fade", message: "status" });

  assert.deepEqual(renderer.appendOutputSegment.mock.calls[0].arguments, ["line\n"]);
  assert.deepEqual(client.health.showStatus.mock.calls[0].arguments, ["status"]);
});

test("socket output event handler updates editor and autocomplete side effects", (t) => {
  const client = createClient(t);
  const handler = createSocketOutputEventHandler({
    client,
    logger: createLogger(t),
    renderer: createRenderer(t),
    setupAutoComplete: () => {}
  });

  handler({
    type: "editor-content",
    updateEditorList: true,
    editor: {
      buffer: "content",
      editorName: "verb",
      uploadCommand: "@program #1:verb"
    }
  });
  handler({ type: "user-type", userType: "staff" });

  assert.equal(client.spawned.verb.id, "editor");
  assert.equal(client.updateEditorListView.mock.callCount(), 1);
  assert.equal(client.userType, "staff");
  assert.deepEqual(client.setupAutoComplete.mock.calls[0].arguments, [client.inputReader, "staff"]);
});

test("socket output event handler does not initialize autocomplete when command hints are disabled", (t) => {
  const client = createClient(t);
  client.preferences.commandSuggestions = false;
  const setupAutoComplete = t.mock.fn();
  const handler = createSocketOutputEventHandler({
    client,
    logger: createLogger(t),
    renderer: createRenderer(t),
    setupAutoComplete
  });

  handler({ type: "user-type", userType: "player" });

  assert.equal(client.userType, "player");
  assert.equal(setupAutoComplete.mock.callCount(), 0);
  assert.equal(client.setupAutoComplete.mock.callCount(), 0);
});

test("socket output event handler forwards SDWC IDE messages", (t) => {
  const client = createClient(t);
  const handler = createSocketOutputEventHandler({
    client,
    logger: createLogger(t),
    renderer: createRenderer(t)
  });

  handler({ type: "sdwc-verbs", payload: ["#1", []] });
  handler({
    type: "sdwc-prop-overlay",
    objectId: "#1",
    propertyName: "name",
    payload: { object: "#1", property: "name" }
  });

  assert.deepEqual(client.ideWindow.postMessage.mock.calls[0].arguments, [
    { type: "ide-object-verbs", payload: ["#1", []] },
    "*"
  ]);
  assert.deepEqual(client.ideWindow.postMessage.mock.calls[1].arguments, [
    {
      type: "ide-prop-overlay",
      objectId: "#1",
      propertyName: "name",
      payload: { object: "#1", property: "name" }
    },
    "*"
  ]);
});

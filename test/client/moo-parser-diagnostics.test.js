import { test } from "node:test";
import assert from "node:assert/strict";
import { attachMooParserDiagnostics } from "../../src/client/features/editor/parser/moo-parser-diagnostics.js";

function createEditor() {
  const handlers = {};
  const session = {
    annotations: null,
    setAnnotations(nextAnnotations) {
      this.annotations = nextAnnotations;
    }
  };
  return {
    handlers,
    offCalls: [],
    value: "return 1;",
    getSession() {
      return session;
    },
    getValue() {
      return this.value;
    },
    on(eventName, handler) {
      handlers[eventName] = handler;
    },
    off(eventName, handler) {
      this.offCalls.push([eventName, handler]);
    },
    session
  };
}

test("attachMooParserDiagnostics does nothing when parser is disabled", () => {
  const previousWorker = globalThis.Worker;
  let constructed = false;
  globalThis.Worker = class {
    constructor() {
      constructed = true;
    }
  };
  try {
    const editor = createEditor();
    const cleanup = attachMooParserDiagnostics(editor, "");
    cleanup();
    assert.equal(constructed, false);
    assert.deepEqual(editor.handlers, {});
    assert.equal(editor.session.annotations, null);
  } finally {
    globalThis.Worker = previousWorker;
  }
});

test("attachMooParserDiagnostics posts editor content and applies current annotations", async () => {
  const previousWorker = globalThis.Worker;
  const workers = [];
  globalThis.Worker = class {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.handlers = {};
      this.messages = [];
      this.terminated = false;
      workers.push(this);
    }
    addEventListener(eventName, handler) {
      this.handlers[eventName] = handler;
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
  };

  try {
    const editor = createEditor();
    const cleanup = attachMooParserDiagnostics(editor, "MOO");
    await new Promise((resolve) => setTimeout(resolve, 350));

    assert.equal(workers.length, 1);
    assert.equal(workers[0].url, "/js/moo-parser-worker.js");
    assert.deepEqual(workers[0].options, { type: "module" });
    assert.deepEqual(workers[0].messages[0], {
      type: "parse",
      id: 1,
      source: "return 1;"
    });

    editor.value = "return ;";
    editor.handlers.change();
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.deepEqual(workers[0].messages[1], {
      type: "parse",
      id: 2,
      source: "return ;"
    });

    workers[0].handlers.message({
      data: {
        id: 1,
        annotations: [{ row: 0, column: 0, text: "stale", type: "error" }]
      }
    });
    assert.equal(editor.session.annotations, null);

    const annotations = [{ row: 0, column: 7, text: "MOO syntax error", type: "error" }];
    workers[0].handlers.message({ data: { id: 2, annotations } });
    assert.deepEqual(editor.session.annotations, annotations);

    cleanup();
    assert.equal(workers[0].terminated, true);
    assert.deepEqual(editor.session.annotations, []);
    assert.equal(editor.offCalls[0][0], "change");
  } finally {
    globalThis.Worker = previousWorker;
  }
});

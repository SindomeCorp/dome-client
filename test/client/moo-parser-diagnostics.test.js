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

test("attachMooParserDiagnostics posts editor content and applies current annotations", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
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
    const annotationUpdates = [];
    const cleanup = attachMooParserDiagnostics(editor, "MOO", {
      onAnnotations: (annotations) => annotationUpdates.push(annotations)
    });
    t.mock.timers.tick(300);

    assert.equal(workers.length, 1);
    assert.equal(workers[0].url, "/js/moo-parser-worker.js");
    assert.deepEqual(workers[0].options, { type: "module" });
    assert.deepEqual(workers[0].messages[0], {
      type: "parse",
      id: 1,
      source: "return 1;"
    });

    editor.value = "return 2;";
    editor.handlers.change();
    t.mock.timers.tick(200);
    editor.value = "return (1 + );";
    editor.handlers.change();

    const stale = {
      data: {
        id: 1,
        annotations: [{ row: 0, column: 0, text: "stale", type: "error" }]
      }
    };
    assert.equal(workers[0].messages.length, 1, "the new edit is still debouncing");
    workers[0].handlers.message(stale);
    assert.equal(editor.session.annotations, null, "the previous reply is already stale");
    assert.deepEqual(annotationUpdates, []);

    t.mock.timers.tick(100);
    assert.equal(workers[0].messages.length, 1);
    t.mock.timers.tick(200);
    assert.deepEqual(workers[0].messages[1], {
      type: "parse",
      id: 3,
      source: "return (1 + );"
    });
    workers[0].handlers.message(stale);
    assert.equal(editor.session.annotations, null);

    const annotations = [{ row: 0, column: 7, text: "MOO syntax error", type: "error" }];
    workers[0].handlers.message({ data: { id: 3, annotations } });
    assert.deepEqual(editor.session.annotations, annotations);
    assert.deepEqual(annotationUpdates, [annotations]);

    editor.value = "return 4;";
    editor.handlers.change();
    workers[0].handlers.message({ data: { id: 3, annotations } });
    assert.deepEqual(editor.session.annotations, []);
    assert.deepEqual(annotationUpdates, [annotations, []]);
    t.mock.timers.tick(300);
    assert.deepEqual(workers[0].messages[2], { type: "parse", id: 4, source: "return 4;" });
    workers[0].handlers.message({ data: { id: 4, annotations: { type: "error" } } });
    assert.deepEqual(editor.session.annotations, []);
    assert.deepEqual(annotationUpdates, [annotations, [], []]);

    editor.handlers.change();
    cleanup();
    t.mock.timers.tick(300);
    workers[0].handlers.message({ data: { id: 5, annotations } });
    assert.equal(workers[0].messages.length, 3);
    assert.equal(workers[0].terminated, true);
    assert.deepEqual(editor.session.annotations, []);
    assert.deepEqual(annotationUpdates, [annotations, [], [], []]);
    assert.equal(editor.offCalls[0][0], "change");
  } finally {
    globalThis.Worker = previousWorker;
  }
});

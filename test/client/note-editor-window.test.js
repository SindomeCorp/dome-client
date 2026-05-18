import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  setupEditor,
  attachUpload,
  attachAbort
} from "../../src/client/pages/editor-utils.js";

test("note editor window", async (t) => {
  let buildDom;
  let setupGlobals;
  let window;
  let initialBody;

  t.before(async () => {
    buildDom = () =>
      "<!doctype html><html><head><title></title></head><body>" +
      "<div class=\"editor\">" +
      "<div class=\"menu\">" +
      "<button class=\"upload\"></button>" +
      "<button class=\"abort\"></button>" +
      "</div>" +
      "<div class=\"status\"></div>" +
      "<div class=\"note-header\">" +
      "<div class=\"note-subject\"><span class=\"header-value\"></span></div>" +
      "<div class=\"note-timestamp\"><span class=\"header-value\"></span></div>" +
      "<div class=\"note-objects\"><span class=\"header-value\"></span></div>" +
      "<div class=\"note-authors\"><span class=\"header-value\"></span></div>" +
      "</div>" +
      "<textarea></textarea>" +
      "</div>" +
      "</body></html>";

    setupGlobals = (win) => {
      const origWindow = globalThis.window;
      const origDocument = globalThis.document;
      const origVerb = globalThis.verbEditor;
      globalThis.window = win;
      globalThis.document = win.document;
      globalThis.verbEditor = null;
      t.after(() => {
        globalThis.window = origWindow;
        globalThis.document = origDocument;
        globalThis.verbEditor = origVerb;
      });
    };

    ({ window } = new JSDOM(buildDom()));
    setupGlobals(window);
    initialBody = window.document.body.innerHTML;

    await import("../../src/client/pages/note-editor-window.js");
  });

  t.beforeEach(() => {
    window.document.title = "";
    window.document.body.innerHTML = initialBody;
    delete window.uploadSocket;
    delete window.editorData;
    delete window.confirm;
    delete window.close;
  });

  await t.test("note editor loads note data", async () => {
    window.uploadSocket = { emit: () => {} };
    window.editorData = {
      editorName: "Test Note",
      uploadCommand: "SAVE",
      buffer: "hello",
      note: {
        subject: "Subj",
        createdat: "Today",
        references: [{ objectnumber: 42, objectname: "Obj" }],
        history: [{ objectnumber: 99, objectname: "Author" }]
      }
    };
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    assert.equal(window.document.title, "Editing Test Note");
    assert.equal(
      window.document.querySelector("button.upload").innerHTML,
      "SAVE"
    );
    assert.equal(
      window.document.querySelector("div.editor textarea").value,
      "hello"
    );
    assert.equal(
      window.document.querySelector(".note-subject .header-value").textContent,
      "Subj"
    );
    assert.equal(
      window.document.querySelector(".note-timestamp .header-value").textContent,
      "Today"
    );
    assert.ok(
      window.document
        .querySelector(".note-objects .header-value")
        .innerHTML.includes("Obj (#42)")
    );
    assert.ok(
      window.document
        .querySelector(".note-authors .header-value")
        .innerHTML.includes("Author")
    );
  });

  await t.test("upload button sends command and buffer", async () => {
    const emit = t.mock.fn();
    window.uploadSocket = { emit };
    window.editorData = {
      editorName: "Note",
      uploadCommand: "SAVE",
      buffer: "initial",
      note: { subject: "", createdat: "" }
    };
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    const textarea = window.document.querySelector("div.editor textarea");
    textarea.value = "updated";
    window.document
      .querySelector("button.upload")
      .dispatchEvent(new window.Event("click"));
    assert.equal(emit.mock.calls.length, 2);
    assert.deepEqual(emit.mock.calls[0].arguments, ["input", "SAVE"]);
    assert.deepEqual(emit.mock.calls[1].arguments, ["input", "updated\n."]);
  });

  await t.test("abort prompts and closes on unsaved changes", async () => {
    window.uploadSocket = { emit: () => {} };
    window.editorData = {
      editorName: "Note",
      uploadCommand: "SAVE",
      buffer: "initial",
      note: { subject: "", createdat: "" }
    };
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    const textarea = window.document.querySelector("div.editor textarea");
    textarea.value = "changed";
    const confirm = t.mock.fn(() => true);
    const close = t.mock.fn();
    window.confirm = confirm;
    window.close = close;
    window.document
      .querySelector("button.abort")
      .dispatchEvent(new window.Event("click"));
    assert.equal(confirm.mock.calls.length, 1);
    assert.equal(close.mock.calls.length, 1);
  });

  await t.test(
    "save shows success message and allows closing without prompt",
    async () => {
      const emit = t.mock.fn();
      window.uploadSocket = { emit };
      window.editorData = {
        editorName: "Note",
        uploadCommand: "SAVE",
        buffer: "initial",
        note: { subject: "", createdat: "" }
      };
      window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
      const textarea = window.document.querySelector("div.editor textarea");
      textarea.value = "updated";
      const close = t.mock.fn();
      const confirm = t.mock.fn(() => true);
      window.close = close;
      window.confirm = confirm;
      window.document
        .querySelector("button.upload")
        .dispatchEvent(new window.Event("click"));
      assert.equal(
        window.document.querySelector(".status").textContent,
        "Saved"
      );
      window.document
        .querySelector("button.abort")
        .dispatchEvent(new window.Event("click"));
      assert.equal(confirm.mock.calls.length, 0);
      assert.equal(close.mock.calls.length, 1);
    }
  );

  await t.test("validation error is shown for empty note", async () => {
    const emit = t.mock.fn();
    window.uploadSocket = { emit };
    window.editorData = {
      editorName: "Note",
      uploadCommand: "SAVE",
      buffer: "",
      note: { subject: "", createdat: "" }
    };
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    const close = t.mock.fn();
    window.close = close;
    window.document
      .querySelector("button.upload")
      .dispatchEvent(new window.Event("click"));
    assert.equal(emit.mock.calls.length, 0);
    assert.equal(
      window.document.querySelector(".status").textContent,
      "Note cannot be empty"
    );
    assert.equal(close.mock.calls.length, 0);
  });

  await t.test("note editor utilities handle setup and actions", async () => {
    const emits = [];
    window.uploadSocket = { emit: (...args) => emits.push(args) };
    window.editorData = {
      editorName: "Note",
      uploadCommand: "SAVE",
      buffer: "initial",
      note: { subject: "", createdat: "" }
    };

    const cta = window.document.querySelector("button.upload");
    const abort = window.document.querySelector("button.abort");
    const textarea = window.document.querySelector("div.editor textarea");
    const initial = { value: textarea.value };

    setupEditor({ uploadCommand: "SAVE", editorName: "Note", cta });
    attachUpload({
      uploadCommand: "SAVE",
      cta,
      getUploadData: () => textarea.value,
      setInitial: (v) => {
        initial.value = v;
      }
    });
    let closed = false;
    attachAbort({
      abortButton: abort,
      getValue: () => textarea.value,
      initialValueRef: initial,
      onAbort: () => {
        closed = true;
      }
    });

    textarea.value = "changed";
    cta.dispatchEvent(new window.Event("click"));
    abort.dispatchEvent(new window.Event("click"));

    assert.equal(window.document.title, "Editing Note");
    assert.deepEqual(emits, [["input", "SAVE"], ["input", "changed\n."]]);
    assert.ok(closed);
  });
});


import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configureEditorParser,
  configureMooEditor,
  MOO_TAB_SIZE,
  normalizeEditorParser
} from "../../src/client/features/editor/ace/editor-options.js";

test("configureMooEditor uses two-space soft tabs", () => {
  const options = {};
  const session = {
    mode: "",
    setMode(nextMode) {
      this.mode = nextMode;
    }
  };
  const editor = {
    getSession() {
      return session;
    },
    setOption(key, value) {
      options[key] = value;
    }
  };

  configureMooEditor(editor);

  assert.equal(session.mode, "ace/mode/moo");
  assert.equal(options.tabSize, 2);
  assert.equal(options.tabSize, MOO_TAB_SIZE);
  assert.equal(options.useSoftTabs, true);
});

test("normalizeEditorParser only enables supported parsers", () => {
  assert.equal(normalizeEditorParser("moo"), "moo");
  assert.equal(normalizeEditorParser("MOO"), "moo");
  assert.equal(normalizeEditorParser(" python "), "");
  assert.equal(normalizeEditorParser(""), "");
});

test("configureEditorParser falls back to text mode when parser is disabled", () => {
  const options = {};
  const session = {
    mode: "",
    setMode(nextMode) {
      this.mode = nextMode;
    }
  };
  const editor = {
    getSession() {
      return session;
    },
    setOption(key, value) {
      options[key] = value;
    }
  };

  configureEditorParser(editor, "python");

  assert.equal(session.mode, "ace/mode/text");
  assert.deepEqual(options, {});
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { configureMooEditor, MOO_TAB_SIZE } from "../../src/client/features/editor/ace/editor-options.js";

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

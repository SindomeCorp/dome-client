/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";

import * as screens from "../../src/controllers/screens.js";

const expectedEditor = (readonly) => ({
  readonly,
  localSaveNodeMaxLines: 200,
  localSaveNodeAdminMaxLines: 800,
  localSaveNoteMaxLines: 20,
  ideEditOpenParent: false,
  ideVmsNoteEnabled: false,
});

export function createRes() {
  const result = {};
  const res = {
    render: (template, locals) => {
      result.template = template;
      result.locals = locals;
    }
  };
  return { res, result };
}

test("connect renders connect-as with metadata", () => {
  const { res, result } = createRes();
  screens.connect({}, res);
  assert.equal(result.template, "connect-as");
  const gameName = result.locals.mooName;
  assert.deepEqual(result.locals.meta, {
    title: "Connect - Modern Gaming Client",
    description: `Connect to ${gameName} using its state of the art Modern Gaming Client. No flash, no plugins, just a modern browser. Play with your iPad or check in from the company computer. There's nothing to install.`,
    keywords: `moo-client, telnet client, modern gaming client, play ${gameName.toLowerCase()}, text-based game, websocket-telnet`
  });
});

test("client renders client with metadata", () => {
  const { res, result } = createRes();
  screens.client({}, res);
  assert.equal(result.template, "client");
  const gameName = "Anaconda";
  assert.deepEqual(result.locals.meta, {
    title: `${gameName}'s Modern Gaming Client`,
    description: `Someone playing ${gameName} via ${gameName}'s Modern Gaming Client`,
    keywords: `moo-client, telnet client, modern gaming client, play ${gameName.toLowerCase()}, text-based game, websocket-telnet`
  });
});


test("editor resolves basic template", () => {
  const { res, result } = createRes();
  const req = { params: { type: "basic" } };
  screens.editor(req, res);
  assert.equal(result.template, "editors/basic");
  assert.deepEqual(result.locals.editor, expectedEditor(false));
  assert.deepEqual(result.locals.meta, {
    title: "Untitled Local Editor ",
    description: "Local editor window for the Anaconda Modern Gaming Client.",
    keywords: "gaming client editor"
  });
});

test("editor resolves basic template in readonly mode", () => {
  const { res, result } = createRes();
  const req = { params: { type: "basic-readonly" } };
  screens.editor(req, res);
  assert.equal(result.template, "editors/basic");
  assert.deepEqual(result.locals.editor, expectedEditor(true));
  assert.deepEqual(result.locals.meta, {
    title: "Untitled Local Editor ",
    description: "Local editor window for the Anaconda Modern Gaming Client.",
    keywords: "gaming client editor",
  });
});

test("editor resolves verb template", () => {
  const { res, result } = createRes();
  const req = { params: { type: "verb" } };
  screens.editor(req, res);
  assert.equal(result.template, "editors/verb");
  assert.deepEqual(result.locals.editor, expectedEditor(false));
  assert.deepEqual(result.locals.meta, {
    title: "Untitled Local Editor ",
    description: "Local editor window for the Anaconda Modern Gaming Client.",
    keywords: "gaming client editor",
  });
});

test("editor resolves note-viewer template", () => {
  const { res, result } = createRes();
  const req = { params: { type: "note-viewer" } };
  screens.editor(req, res);
  assert.equal(result.template, "editors/note-viewer");
  assert.deepEqual(result.locals.editor, expectedEditor(false));
  assert.deepEqual(result.locals.meta, {
    title: "Untitled Local Editor ",
    description: "Local editor window for the Anaconda Modern Gaming Client.",
    keywords: "gaming client editor",
  });
});

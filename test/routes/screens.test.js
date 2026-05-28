/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import config from "../../src/config/index.js";

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
  assert.equal(result.locals.connectAnywhere, config.node.multiMud);
  const gameName = result.locals.mooName;
  assert.deepEqual(result.locals.meta, {
    title: "Connect - Modern Gaming Client",
    description: `Connect to ${gameName} using its state of the art Modern Gaming Client. No flash, no plugins, just a modern browser. Play with your iPad or check in from the company computer. There's nothing to install.`,
    keywords: `moo-client, telnet client, modern gaming client, play ${gameName.toLowerCase()}, text-based game, websocket-telnet`
  });
});

test("connect enables multi-mud locals when configured", () => {
  const original = config.node.multiMud;
  config.node.multiMud = true;
  const { res, result } = createRes();
  screens.connect({}, res);
  config.node.multiMud = original;
  assert.equal(result.locals.connectAnywhere, true);
  assert.equal(result.locals.mooHostname, config.moo.host);
  assert.equal(result.locals.mooPort, config.moo.port);
  assert.equal(typeof result.locals.connected, "function");
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

test("gameOwnerQuestions returns 404 outside multi-mud mode", () => {
  const original = config.node.multiMud;
  config.node.multiMud = false;
  const result = {};
  const res = {
    status: (code) => {
      result.statusCode = code;
      return {
        send: (body) => {
          result.body = body;
        }
      };
    }
  };
  screens.gameOwnerQuestions({}, res);
  config.node.multiMud = original;
  assert.equal(result.statusCode, 404);
  assert.equal(result.body, "Not Found");
});

test("gameOwnerQuestions renders page in multi-mud mode", () => {
  const original = config.node.multiMud;
  config.node.multiMud = true;
  const { res, result } = createRes();
  screens.gameOwnerQuestions({}, res);
  config.node.multiMud = original;
  assert.equal(result.template, "game-owner-questions");
  assert.deepEqual(result.locals.meta, {
    title: "Game Owner Questions - Modern Gaming Client",
    description: "How game owners can use this web-based client and request player host/IP metadata during login.",
    keywords: "mud client, game owner, dome-client-user, connection metadata"
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

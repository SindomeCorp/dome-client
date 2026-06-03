import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSocketOutputProtocolParser,
  findDotTerminator,
  normalizeSocketNewlines
} from "../../src/client/features/terminal/socket-output-protocol.js";

test("normalizeSocketNewlines converts CRLF and CR to LF", () => {
  assert.equal(normalizeSocketNewlines("a\r\nb\rc\n"), "a\nb\nc\n");
});

test("findDotTerminator detects standalone dot lines", () => {
  assert.deepEqual(findDotTerminator(".\n"), {
    index: 0,
    length: 2,
    hasLeadingNewline: false
  });
  assert.deepEqual(findDotTerminator("line\n.\nnext\n"), {
    index: 5,
    length: 2,
    hasLeadingNewline: true
  });
});

test("protocol parser carries partial lines until newline arrives", () => {
  const parser = createSocketOutputProtocolParser();

  assert.deepEqual(parser.parse("hel"), []);
  assert.deepEqual(parser.parse("lo\n"), [{ type: "text", text: "hello\n" }]);
});

test("protocol parser emits editor content after split terminator", () => {
  const parser = createSocketOutputProtocolParser();

  assert.deepEqual(parser.parse("#$# edit name: foo upload: @program foo\nline1\n."), []);
  assert.equal(parser.editorState.readingContent, true);

  const events = parser.parse("\nchannel message\n");
  assert.deepEqual(events, [
    {
      type: "editor-content",
      editor: {
        readingContent: true,
        buffer: "line1\n",
        editorName: "foo",
        uploadCommand: "@program foo"
      }
    },
    { type: "fade", message: "BUFFERING POPUP ..." },
    { type: "text", text: "channel message\n" }
  ]);
  assert.equal(parser.editorState.readingContent, false);
});

test("protocol parser marks same-segment editor content for list refresh", () => {
  const parser = createSocketOutputProtocolParser();

  assert.deepEqual(parser.parse("#$# edit name: foo upload: @program foo\nline1\n.\n"), [{
    type: "editor-content",
    updateEditorList: true,
    editor: {
      editorName: "foo",
      uploadCommand: "@program foo",
      buffer: "line1"
    }
  }]);
});

test("protocol parser emits SDWC payload events", () => {
  const parser = createSocketOutputProtocolParser();

  assert.deepEqual(
    parser.parse("#$# SDWC%%verbs%%[\"#1\",[[\"#1\",\"look\"]]]\n"),
    [{
      type: "sdwc-verbs",
      payload: ["#1", [["#1", "look"]]]
    }]
  );
  assert.deepEqual(
    parser.parse("#$# SDWC%%PROPS%%{\"id\":\"#1\"}\n"),
    [{
      type: "sdwc-props",
      payload: { id: "#1" }
    }]
  );
});

test("protocol parser emits SDWC overlay events", () => {
  const parser = createSocketOutputProtocolParser();

  assert.deepEqual(
    parser.parse("#$# SDWC%%VERB-OVERLAY%%{\"object\":\"#1\",\"verb\":\"look\"}\n"),
    [{
      type: "sdwc-verb-overlay",
      objectId: "#1",
      verbName: "look",
      payload: { object: "#1", verb: "look" }
    }]
  );
  assert.deepEqual(
    parser.parse("#$# SDWC%%PROP-OVERLAY%%{\"object\":\"#1\",\"property\":\"name\"}\n"),
    [{
      type: "sdwc-prop-overlay",
      objectId: "#1",
      propertyName: "name",
      payload: { object: "#1", property: "name" }
    }]
  );
});

test("protocol parser preserves text order around nowrap markers", () => {
  const parser = createSocketOutputProtocolParser();

  assert.deepEqual(
    parser.parse("before\n#$# SDWC-START-NOWRAP\ninside\n#$# SDWC-END-NOWRAP\nafter\n"),
    [
      { type: "text", text: "before\n" },
      { type: "sdwc-nowrap-start" },
      { type: "text", text: "inside\n" },
      { type: "sdwc-nowrap-end" },
      { type: "text", text: "after\n" }
    ]
  );
});

test("protocol parser emits ping and user-type events", () => {
  const parser = createSocketOutputProtocolParser();

  assert.deepEqual(parser.parse("#$# - PING!\n"), [{ type: "ping" }]);
  assert.deepEqual(
    parser.parse("#$# user user-type staff\n"),
    [{ type: "user-type", userType: "st" }]
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("login notices and consecutive user/profile markers preserve boundaries at every packet split", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../test-support/fixtures/context-profile-login.json", import.meta.url), "utf8"));
  const expected = [
    { type: "text", text: fixture.notice + "\n" },
    { type: "user-type", userType: fixture.userType },
    { type: "context-profile", id: fixture.profile },
    { type: "text", text: fixture.after + "\n" }
  ];
  for (const newline of ["\n", "\r\n", "\r"]) {
    const wire = [fixture.notice, "#$# user-type " + fixture.userType, "#$# SDWC%%CONTEXT-PROFILE%%" + JSON.stringify(fixture.profile), fixture.after, ""].join(newline);
    for (let split = 0; split <= wire.length; split++) {
      const parser = createSocketOutputProtocolParser();
      const events = [...parser.parse(wire.slice(0, split)), ...parser.parse(""), ...parser.parse(wire.slice(split))];
      assert.deepEqual(events, expected, "newline " + JSON.stringify(newline) + ", split " + split);
    }
    const parser = createSocketOutputProtocolParser();
    assert.deepEqual([...wire].flatMap((character) => parser.parse(character)), expected);
  }
});

test("all control-line types preserve surrounding output and the next profile marker", () => {
  const controls = [
    ["#$# user ignored", []],
    ["#$# - PING!", [{ type: "ping" }]],
    ["#$# SDWC%%SUPPORT%%CONTEXT-PROFILE", [{ type: "sdwc-unknown", command: "SDWC%%SUPPORT%%CONTEXT-PROFILE" }]],
    ["#$# status-message", [{ type: "fade", message: "status-message" }]],
    ["#$# edit name: fixture upload: @program fixture\nsource\n.", [{ type: "editor-content", updateEditorList: true, editor: { editorName: "fixture", uploadCommand: "@program fixture", buffer: "source" } }]]
  ];
  for (const [control, events] of controls) {
    for (const prefix of ["before\n", "\n", "before\n\n"]) {
      const parser = createSocketOutputProtocolParser();
      assert.deepEqual(parser.parse(prefix + control + "\n#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\nafter\n"), [
        { type: "text", text: prefix }, ...events,
        { type: "context-profile", id: "programmer" },
        { type: "text", text: "after\n" }
      ], control);
    }
  }
});

test("streamed editor headers retain preceding lines and reset clears CRLF continuation state", () => {
  const parser = createSocketOutputProtocolParser();
  assert.deepEqual(parser.parse("before\n#$# edit name: fixture upload: @program fixture\nsource\n"), [{ type: "text", text: "before\n" }]);
  const events = parser.parse(".\n#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\nafter\n");
  assert.equal(events[0].type, "editor-content");
  assert.equal(events[0].editor.buffer, "source");
  assert.deepEqual(events.slice(2), [{ type: "context-profile", id: "programmer" }, { type: "text", text: "after\n" }]);
  parser.parse("old\r");
  parser.reset();
  assert.deepEqual(parser.parse("\nnew\n"), [{ type: "text", text: "\nnew\n" }]);
});

test("protocol parser emits editor content after split terminator", () => {
  const parser = createSocketOutputProtocolParser();

  assert.deepEqual(parser.parse("#$# edit name: foo upload: @program foo\nline1\n."), []);
  assert.equal(parser.editorState.readingContent, true);

  const events = parser.parse("\nchannel message\n");
  assert.deepEqual(events, [
    {
      type: "editor-content",
      updateEditorList: true,
      editor: {
        buffer: "line1",
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
    [{ type: "user-type", userType: "staff" }]
  );
});

test("editor content is independent of packet boundaries", () => {
  const header = "#$# edit name: fixture upload: @program fixture\r\n";
  for (const source of ["", "one", "one\r\ntwo", "one\r\n"]) {
    const wire = header + (source ? source + "\r\n" : "") + ".\r\nnext\r\n";
    const expected = [
      { type: "editor-content", updateEditorList: true, editor: {
        editorName: "fixture", uploadCommand: "@program fixture", buffer: normalizeSocketNewlines(source)
      } },
      { type: "text", text: "next\n" }
    ];
    for (let split = 0; split <= wire.length; split++) {
      const parser = createSocketOutputProtocolParser();
      const events = [...parser.parse(wire.slice(0, split)), ...parser.parse(wire.slice(split))];
      assert.deepEqual(events.filter(event => event.type !== "fade"), expected, "split " + split);
    }
  }
});

test("SDWC JSON keeps edit field separators inside payloads and recovers after invalid JSON", () => {
  const parser = createSocketOutputProtocolParser();
  const payload = { label: "object name: fixture upload: nothing %% remaining" };
  const events = parser.parse("#$# SDWC%%PROPS%%" + JSON.stringify(payload) +
    "\n#$# SDWC%%VERBS%%[\n#$# SDWC%%CONTEXT-RESET\nready\n");
  assert.deepEqual(events[0], { type: "sdwc-props", payload });
  assert.equal(events[1].type, "sdwc-parse-error");
  assert.equal(events[1].command, "sdwc-verbs");
  assert.deepEqual(events.slice(2), [{ type: "context-reset" }, { type: "text", text: "ready\n" }]);
});

test("a reset discards a pending editor and partial output", () => {
  const parser = createSocketOutputProtocolParser();
  parser.parse("#$# edit name: old upload: @program old\npartial");
  assert.equal(parser.editorState.readingContent, true);
  parser.reset();
  assert.deepEqual(parser.parse("new\n"), [{ type: "text", text: "new\n" }]);
});

test("profile and overlay messages retain typed payloads and reject invalid IDs", () => {
  const parser = createSocketOutputProtocolParser();
  const marker = (command, value) => "#$# SDWC%%" + command + "%%" + JSON.stringify(value) + "\n";
  for (const id of ["staff-gm_2", "A" + "f".repeat(63)]) {
    assert.deepEqual(parser.parse(marker("context-profile", id)), [{ type: "context-profile", id }]);
  }
  for (const id of [null, "two words", "1staff", "A" + "f".repeat(64), "x".repeat(140), { id: "player" }]) {
    assert.deepEqual(parser.parse(marker("context-profile", id)), [{ type: "context-profile", id: null }]);
  }
  const payload = { object: " #5 ", property: " label " };
  assert.deepEqual(parser.parse(marker(" prop-overlay ", payload)), [
    { type: "sdwc-prop-overlay", objectId: "#5", propertyName: "label", payload }
  ]);
  assert.deepEqual(parser.parse("#$# SDWC%%VERB-OVERLAY\n"), [
    { type: "sdwc-verb-overlay", objectId: "", verbName: "", payload: null }
  ]);
});

test("the streamed editor preserves separate body chunks until the terminator", () => {
  const parser = createSocketOutputProtocolParser();
  assert.deepEqual(parser.parse("#$# edit name: stream upload: fixture-command\r\n"), []);
  const waiting = [{ type: "fade", message: "<span class=\"warn\">BUFFERING POPUP ...</span>" }];
  assert.deepEqual(parser.parse("first\r\n"), waiting);
  assert.deepEqual(parser.parse("second\r\n"), waiting);
  assert.deepEqual(parser.parse(".\r\n"), [
    { type: "editor-content", updateEditorList: true, editor: {
      editorName: "stream", uploadCommand: "fixture-command", buffer: "first\nsecond"
    } },
    { type: "fade", message: "BUFFERING POPUP ..." }
  ]);
});

test("overlay parse failures and empty payloads leave subsequent output readable", () => {
  const parser = createSocketOutputProtocolParser();
  assert.deepEqual(parser.parse(null), []);
  const events = parser.parse("#$# SDWC%%PROP-OVERLAY%%{\n#$# SDWC%%PROP-OVERLAY\n" +
    "#$#   sdwc-start-nowrap  \ntext\n#$# SDWC-END-NOWRAP\n#$# notice SDWC\n");
  assert.equal(events[0].type, "sdwc-parse-error");
  assert.equal(events[0].command, "sdwc-prop-overlay");
  assert.deepEqual(events.slice(1), [
    { type: "sdwc-prop-overlay", objectId: "", propertyName: "", payload: null },
    { type: "sdwc-nowrap-start" }, { type: "text", text: "text\n" }, { type: "sdwc-nowrap-end" },
    { type: "fade", message: "notice SDWC" }
  ]);
});

test("profile payloads honor the size boundary before decoding", () => {
  const parser = createSocketOutputProtocolParser();
  const prefix = "#$# SDWC%%CONTEXT-PROFILE%%";
  const boundary = "\"" + "\\u0061".repeat(21) + "\"";
  assert.equal(boundary.length, 128);
  assert.deepEqual(parser.parse(prefix + boundary + "\n"), [{ type: "context-profile", id: "a".repeat(21) }]);
  assert.deepEqual(parser.parse(prefix + boundary.slice(0, -1) + "a\"\n"), [{ type: "context-profile", id: null }]);
  assert.deepEqual(parser.parse(prefix + "{\n"), [{ type: "context-profile", id: null }]);
});

test("empty or dotted editor buffers retain their source and the following output at every packet split", () => {
  for (const buffer of ["", "single.\n..\n. leading text\nlast."]) {
    const header = "#$# edit name: fixture upload: @program #12:preview\n";
    const body = buffer ? buffer + "\n" : "";
    const next = "normal output\n";
    const wire = header + body + ".\n" + next;

    for (let split = 0; split <= wire.length; split++) {
      const parser = createSocketOutputProtocolParser();
      const events = [...parser.parse(wire.slice(0, split)), ...parser.parse(wire.slice(split))]
        .filter(({ type }) => type !== "fade");
      assert.deepEqual(events, [{
        type: "editor-content",
        updateEditorList: true,
        editor: { editorName: "fixture", uploadCommand: "@program #12:preview", buffer }
      }, { type: "text", text: next }], "packet split at " + split + " for " + JSON.stringify(buffer));
    }
  }
});

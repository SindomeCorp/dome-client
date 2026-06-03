import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand, getCommandLabel } from "../../src/client/core/command-utils.js";

test("parseCommand splits command and target", () => {
  const { command, commandTarget } = parseCommand("@program foo");
  assert.equal(command, "@program");
  assert.equal(commandTarget, "foo");
});

test("parseCommand preserves editor targets used by the IDE", () => {
  assert.deepEqual(parseCommand("@program #1:verb"), {
    command: "@program",
    commandTarget: "#1:verb"
  });
  assert.deepEqual(parseCommand("@edit #1:verb"), {
    command: "@edit",
    commandTarget: "#1:verb"
  });
  assert.deepEqual(parseCommand("@edit #1.prop"), {
    command: "@edit",
    commandTarget: "#1.prop"
  });
  assert.deepEqual(parseCommand("@set-note-string #1.prop"), {
    command: "@set-note-string",
    commandTarget: "#1.prop"
  });
  assert.deepEqual(parseCommand("@set-note-text #1.prop"), {
    command: "@set-note-text",
    commandTarget: "#1.prop"
  });
});

test("parseCommand handles missing target", () => {
  const { command, commandTarget } = parseCommand("@@set_note");
  assert.equal(command, "@@set_note");
  assert.equal(commandTarget, "");
});

test("getCommandLabel returns empty string when command is missing", () => {
  assert.equal(getCommandLabel("", ""), "");
});

test("getCommandLabel falls back to command and target for unknown command", () => {
  assert.equal(getCommandLabel("@foo bar", ""), "@foo bar");
});

test("getCommandLabel returns Editing Note with editorName for @@set_note", () => {
  assert.equal(getCommandLabel("@@set_note foo", "bar"), "Editing Note: bar");
});

test("getCommandLabel appends (LIST) for @@set", () => {
  assert.equal(getCommandLabel("@@set foo", ""), "foo (LIST)");
});

test("getCommandLabel returns target for @program", () => {
  assert.equal(getCommandLabel("@program foo", ""), "foo");
});

test("getCommandLabel returns target for @set-note-text", () => {
  assert.equal(getCommandLabel("@set-note-text bar", ""), "bar");
});

test("getCommandLabel returns target for @set-note-string", () => {
  assert.equal(getCommandLabel("@set-note-string baz", ""), "baz");
});

test("getCommandLabel returns command and target for @grep", () => {
  assert.equal(getCommandLabel("@grep baz", ""), "@grep baz");
});

test("getCommandLabel uses editorName when command string missing", () => {
  assert.equal(getCommandLabel("", "@foo bar"), "@foo bar");
});

test("getCommandLabel uses editorName when command string is none", () => {
  assert.equal(getCommandLabel("none", "@foo bar"), "@foo bar");
});

test("getCommandLabel returns empty string when both command string and editorName are none", () => {
  assert.equal(getCommandLabel("none", "none"), "");
});

test("getCommandLabel returns title for @scratch", () => {
  assert.equal(getCommandLabel("@scratch foo", ""), "foo");
});

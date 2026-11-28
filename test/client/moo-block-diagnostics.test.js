import { test } from "node:test";
import assert from "node:assert/strict";
import { collectMooBlockDiagnostics } from "../../src/client/features/editor/parser/moo-block-diagnostics.js";

test("collectMooBlockDiagnostics reports missing endif on opening if line", () => {
  const source = [
    "\"doc string mentioning endif\";",
    "{objs, ?sepr = \" \"} = args;",
    "if (typeof(objs) != LIST)",
    "  objs = {objs};",
    "",
    "name_list = {};",
    "for what in (objs)",
    "  if (verb == \"nn_brief\")",
    "    name = $su:subst(name, {{\"Generic\", \"G.\"}});",
    "  endif",
    "endfor",
    "return $string_utils:english_list(name_list);"
  ].join("\n");

  assert.deepEqual(collectMooBlockDiagnostics(source), [{
    row: 2,
    column: 0,
    text: "Missing endif",
    type: "error"
  }, {
    row: 11,
    column: 45,
    text: "Missing block terminator: endif",
    type: "error"
  }]);
});

test("collectMooBlockDiagnostics summarizes all missing terminators at end of file", () => {
  const source = [
    "for what in (objs)",
    "  if (verb == \"nn_brief\")",
    "    name = $su:subst(name, {{\"Generic\", \"G.\"}});",
    "return name;"
  ].join("\n");

  assert.deepEqual(collectMooBlockDiagnostics(source), [
    {
      row: 1,
      column: 2,
      text: "Missing endif",
      type: "error"
    },
    {
      row: 0,
      column: 0,
      text: "Missing endfor",
      type: "error"
    },
    {
      row: 3,
      column: 12,
      text: "Missing block terminators: endif, endfor",
      type: "error"
    }
  ]);
});

test("collectMooBlockDiagnostics ignores block words in strings and property-like names", () => {
  const source = [
    "\"if endif for endfor\";",
    "value = object.endif;",
    "result = $endif_utils:check(value);",
    "return result;"
  ].join("\n");

  assert.deepEqual(collectMooBlockDiagnostics(source), []);
});

test("collectMooBlockDiagnostics reports mismatched closing block", () => {
  const source = [
    "for item in (items)",
    "  item:tell();",
    "endif"
  ].join("\n");

  assert.deepEqual(collectMooBlockDiagnostics(source), [
    {
      row: 0,
      column: 0,
      text: "Missing endfor",
      type: "error"
    },
    {
      row: 2,
      column: 0,
      text: "Unexpected endif",
      type: "error"
    }
  ]);
});

test("collectMooBlockDiagnostics treats ordinary variable names as identifiers", () => {
  assert.deepEqual(collectMooBlockDiagnostics("constructor = 1; return constructor;"), []);
});

test("collectMooBlockDiagnostics tracks columns after escaped quotes and embedded newlines", () => {
  const lines = [
    String.raw`value = "an escaped quote: \"endfork`,
    "and an escaped newline\\",
    "endif\";\t fork job (0)",
    "    while (1)"
  ];
  assert.deepEqual(collectMooBlockDiagnostics(lines.join("\n")), [
    { row: 3, column: 4, text: "Missing endwhile", type: "error" },
    { row: 2, column: lines[2].indexOf("fork"), text: "Missing endfork", type: "error" },
    { row: 3, column: lines[3].length, text: "Missing block terminators: endwhile, endfork", type: "error" }
  ]);
});

test("collectMooBlockDiagnostics reports every orphaned branch and closer", () => {
  const source = "  ENDTRY\n\tELSEIF (0)\nelse\nexcept err (ANY)\n finally";
  assert.deepEqual(collectMooBlockDiagnostics(source), [
    { row: 0, column: 2, text: "Unexpected endtry", type: "error" },
    { row: 1, column: 1, text: "Unexpected elseif", type: "error" },
    { row: 2, column: 0, text: "Unexpected else", type: "error" },
    { row: 3, column: 0, text: "Unexpected except", type: "error" },
    { row: 4, column: 1, text: "Unexpected finally", type: "error" }
  ]);
});

test("collectMooBlockDiagnostics closes nested try, fork and while blocks", () => {
  const source = "try\n  fork job (0)\n    while (1)\n    endwhile\n  endfork\nfinally\nendtry";
  assert.deepEqual(collectMooBlockDiagnostics(source), []);
});

test("collectMooBlockDiagnostics keeps same-line columns after strings and other tokens", () => {
  const source = String.raw`value = call("escaped \"quote\"");  while (1)`;
  assert.deepEqual(collectMooBlockDiagnostics(source), [
    { row: 0, column: source.indexOf("while"), text: "Missing endwhile", type: "error" },
    { row: 0, column: source.length, text: "Missing block terminator: endwhile", type: "error" }
  ]);
});

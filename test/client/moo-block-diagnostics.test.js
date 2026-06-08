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

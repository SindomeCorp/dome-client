import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Language, Parser } from "web-tree-sitter";
import { collectMooBlockDiagnostics } from "../../src/client/features/editor/parser/moo-block-diagnostics.js";

test("packaged MOO Wasm accepts nested try/finally without except handlers", async () => {
  const source = [
    "try",
    "  if (phase == \"edges\")",
    "    try",
    "      player = actor;",
    "      nonwizard = `this:_authorize(\"production\", actor) ! E_PERM => \"blocked\"';",
    "    finally",
    "      player = real_player;",
    "    endtry",
    "  endif",
    "finally",
    "  cleanup();",
    "endtry"
  ].join("\n");

  await Parser.init();
  const language = await Language.load(fileURLToPath(import.meta.resolve("tree-sitter-moo/wasm")));
  const parser = new Parser();
  let tree;
  try {
    parser.setLanguage(language);
    tree = parser.parse(source);
    assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.deepEqual(collectMooBlockDiagnostics(source), []);
  } finally {
    tree?.delete();
    parser.delete();
  }
});

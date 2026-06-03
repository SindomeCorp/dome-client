import { test } from "node:test";
import assert from "node:assert/strict";
import ace from "ace-builds/src-noconflict/ace.js";
import "../../src/client/features/editor/ace/mode-moo.js";

function createMode() {
  const { Mode } = ace.require("ace/mode/moo");
  return new Mode();
}

function tokenTypesFor(mode, line, state = "start") {
  return mode.$tokenizer.getLineTokens(line, state).tokens.map((token) => token.type);
}

function createDocument(lines) {
  return {
    lines: [...lines],
    replacements: [],
    getLine(row) {
      return this.lines[row];
    },
    indentRows(startRow, endRow, prefix) {
      for (let row = startRow; row <= endRow; row += 1) {
        this.lines[row] = prefix + this.lines[row];
      }
    },
    replace(range, text) {
      this.replacements.push({ range, text });
      const line = this.lines[range.start.row];
      this.lines[range.start.row] = line.slice(0, range.start.column) + text + line.slice(range.end.column);
    },
    findMatchingBracket() {
      return { row: 0, column: 0 };
    }
  };
}

test("MOO mode tokenizes common MOO syntax and doc comments", () => {
  const mode = createMode();

  assert.deepEqual(
    tokenTypesFor(mode, "if (player == this) return tostr(#123); endif"),
    [
      "keyword",
      "text",
      "paren.lparen",
      "variable.language",
      "text",
      "keyword.operator",
      "text",
      "variable.language",
      "paren.rparen",
      "text",
      "keyword",
      "text",
      "support.function",
      "paren.lparen",
      "text",
      "constant.numeric",
      "paren.rparen",
      "punctuation.operator",
      "text",
      "keyword"
    ]
  );

  assert.deepEqual(
    tokenTypesFor(mode, "\"comment\";"),
    ["comment"]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "/** TODO @tag */"),
    ["comment.doc", "comment.doc.tag", "comment.doc"]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "return {MAP, WAIF, ANON, BOOL};"),
    [
      "keyword",
      "text",
      "paren.lparen",
      "constant.language",
      "punctuation.operator",
      "text",
      "constant.language",
      "punctuation.operator",
      "text",
      "constant.language",
      "punctuation.operator",
      "text",
      "constant.language",
      "paren.rparen",
      "punctuation.operator"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "return sql_query(curl(url_encode(\"x\")));"),
    [
      "keyword",
      "text",
      "support.function",
      "paren.lparen",
      "support.function",
      "paren.lparen",
      "support.function",
      "paren.lparen",
      "string",
      "paren.rparen",
      "punctuation.operator"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "return tonum(x);"),
    [
      "keyword",
      "text",
      "identifier",
      "paren.lparen",
      "identifier",
      "paren.rparen",
      "punctuation.operator"
    ]
  );
});

test("MOO mode tokenizes regular expressions when grammar allows them", () => {
  const mode = createMode();

  assert.deepEqual(
    tokenTypesFor(mode, "return /foo[0-9]+/;"),
    [
      "keyword",
      "text",
      "string.regexp",
      "constant.language.escape",
      "string.regexp.charachterclass",
      "constant.language.escape",
      "string.regexp.charachterclass",
      "constant.language.escape",
      "string.regexp",
      "punctuation.operator"
    ]
  );
});

test("MOO mode toggles comments on selected document rows", () => {
  const mode = createMode();
  const uncommentDoc = createDocument(["  //one", "//two"]);
  const commentDoc = createDocument(["one", "  two"]);

  mode.toggleCommentLines("start", uncommentDoc, 0, 1);
  mode.toggleCommentLines("start", commentDoc, 0, 1);

  assert.deepEqual(uncommentDoc.lines, ["  one", "two"]);
  assert.deepEqual(commentDoc.lines, ["//one", "//  two"]);
});

test("MOO mode preserves indentation rules and delegates outdent behavior", () => {
  const mode = createMode();
  const doc = createDocument(["if (x) {", "  }"]);

  assert.equal(mode.getNextLineIndent("start", "if (x) {", "  "), "  ");
  assert.equal(mode.getNextLineIndent("start", "  // comment", "  "), "  ");
  assert.equal(mode.getNextLineIndent("doc-start", " * details", "  "), " * ");
  assert.equal(mode.getNextLineIndent("doc-start", " */", "  "), "");
  assert.equal(mode.checkOutdent("start", "  ", "}"), true);

  mode.autoOutdent("start", doc, 1);

  assert.equal(doc.lines[1], "}");
  assert.equal(mode.createWorker(), null);
});

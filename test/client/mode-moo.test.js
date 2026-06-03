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
      "constant.language.object",
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
  assert.deepEqual(
    tokenTypesFor(mode, "except err (ANY)"),
    [
      "keyword",
      "text",
      "identifier",
      "text",
      "paren.lparen",
      "constant.language",
      "paren.rparen"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "return {E_TYPE, E_ARGS, ANY, NONE, TRUE, FALSE, true, false};"),
    [
      "keyword",
      "text",
      "paren.lparen",
      "constant.language.error",
      "punctuation.operator",
      "text",
      "constant.language.error",
      "punctuation.operator",
      "text",
      "constant.language",
      "punctuation.operator",
      "text",
      "constant.language",
      "punctuation.operator",
      "text",
      "constant.language.boolean",
      "punctuation.operator",
      "text",
      "constant.language.boolean",
      "punctuation.operator",
      "text",
      "constant.language.boolean",
      "punctuation.operator",
      "text",
      "constant.language.boolean",
      "paren.rparen",
      "punctuation.operator"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "fork job (5)"),
    [
      "keyword",
      "text",
      "identifier",
      "text",
      "paren.lparen",
      "constant.numeric",
      "paren.rparen"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "endfork"),
    ["keyword"]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "$player:tell(#-1, $nothing.name);"),
    [
      "entity.other.object.receiver.moo",
      "punctuation.operator",
      "entity.name.function.moo",
      "paren.lparen",
      "constant.language.object",
      "punctuation.operator",
      "text",
      "entity.other.object.receiver.moo",
      "punctuation.operator",
      "variable.other.property.moo",
      "paren.rparen",
      "punctuation.operator"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "$code_utils"),
    ["constant.language.core"]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "$critical(\"some content\")"),
    [
      "entity.name.function.moo",
      "paren.lparen",
      "string",
      "paren.rparen"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "$code_utils:critical(\"some content\")"),
    [
      "entity.other.object.receiver.moo",
      "punctuation.operator",
      "entity.name.function.moo",
      "paren.lparen",
      "string",
      "paren.rparen"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "#0:critical()"),
    [
      "entity.other.object.receiver.moo",
      "punctuation.operator",
      "entity.name.function.moo",
      "paren.lparen",
      "paren.rparen"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "#15840:verbname()"),
    [
      "entity.other.object.receiver.moo",
      "punctuation.operator",
      "entity.name.function.moo",
      "paren.lparen",
      "paren.rparen"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "$code_utils.name"),
    [
      "entity.other.object.receiver.moo",
      "punctuation.operator",
      "variable.other.property.moo"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "#15840.some_prop"),
    [
      "entity.other.object.receiver.moo",
      "punctuation.operator",
      "variable.other.property.moo"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "player.name"),
    [
      "variable.other.object.receiver.moo",
      "punctuation.operator",
      "variable.other.property.moo"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "this.production_check"),
    [
      "variable.other.object.receiver.moo",
      "punctuation.operator",
      "variable.other.property.moo"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "dude.name"),
    [
      "variable.other.object.receiver.moo",
      "punctuation.operator",
      "variable.other.property.moo"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "dude:some_verb()"),
    [
      "variable.other.object.receiver.moo",
      "punctuation.operator",
      "entity.name.function.moo",
      "paren.lparen",
      "paren.rparen"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "$code_utils:critical"),
    [
      "entity.other.object.receiver.moo",
      "punctuation.operator",
      "identifier"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "$critical"),
    ["constant.language.core"]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "items = {@items, [\"key\" -> value][1..$]};"),
    [
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "paren.lparen",
      "keyword.operator",
      "identifier",
      "punctuation.operator",
      "text",
      "paren.lparen",
      "string",
      "text",
      "keyword.operator",
      "text",
      "identifier",
      "paren.rparen",
      "paren.lparen",
      "constant.numeric",
      "keyword.operator",
      "paren.rparen",
      "punctuation.operator"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "flag = x &. (1 << 2);"),
    [
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "paren.lparen",
      "constant.numeric",
      "text",
      "keyword.operator",
      "text",
      "constant.numeric",
      "paren.rparen",
      "punctuation.operator"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "return const + let + var + function;"),
    [
      "keyword",
      "text",
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "identifier",
      "punctuation.operator"
    ]
  );
  assert.deepEqual(
    tokenTypesFor(mode, "return new + delete + instanceof + void + throw + yield;"),
    [
      "keyword",
      "text",
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "identifier",
      "text",
      "keyword.operator",
      "text",
      "identifier",
      "punctuation.operator"
    ]
  );
});

test("MOO mode does not tokenize JavaScript regular expression literals", () => {
  const mode = createMode();

  assert.deepEqual(
    tokenTypesFor(mode, "return /foo[0-9]+/;"),
    [
      "keyword",
      "text",
      "keyword.operator",
      "identifier",
      "paren.lparen",
      "constant.numeric",
      "paren.rparen",
      "keyword.operator",
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

test("MOO mode indents and outdents keyword-terminated blocks", () => {
  const mode = createMode();
  const endifDoc = createDocument(["if (x)", "  endif"]);
  const elseifDoc = createDocument(["if (x)", "  elseif (y)"]);
  const elseDoc = createDocument(["if (x)", "  else"]);
  const endforDoc = createDocument(["for i in [1..10]", "  endfor"]);
  const endwhileDoc = createDocument(["while (x)", "  endwhile"]);
  const endtryDoc = createDocument(["try", "  endtry"]);
  const exceptDoc = createDocument(["try", "  except err (ANY)"]);
  const finallyDoc = createDocument(["try", "  except err (ANY)", "    finally"]);
  const endforkDoc = createDocument(["fork job (5)", "  endfork"]);

  assert.equal(mode.getNextLineIndent("start", "if (x)", "  "), "  ");
  assert.equal(mode.getNextLineIndent("start", "try", "  "), "  ");
  assert.equal(mode.getNextLineIndent("start", "except err (ANY)", "  "), "  ");
  assert.equal(mode.getNextLineIndent("start", "finally", "  "), "  ");
  assert.equal(mode.getNextLineIndent("start", "fork job (5)", "  "), "  ");
  assert.equal(mode.getNextLineIndent("start", "items = {@items, x};", "  "), "");
  assert.equal(mode.getNextLineIndent("start", "  // comment", "  "), "  ");
  assert.equal(mode.getNextLineIndent("doc-start", " * details", "  "), " * ");
  assert.equal(mode.getNextLineIndent("doc-start", " */", "  "), "");
  assert.equal(mode.checkOutdent("start", "  ", "endif"), true);
  for (const keyword of ["endif", "endfor", "endwhile", "endtry", "endfork", "elseif", "else", "except", "finally"]) {
    assert.equal(mode.checkOutdent("start", "  ", keyword), true);
    assert.equal(mode.checkOutdent("start", `  ${keyword.slice(0, -1)}`, keyword.at(-1)), true);
  }
  assert.equal(mode.checkOutdent("start", "  ", "}"), false);

  mode.autoOutdent("start", endifDoc, 1);
  mode.autoOutdent("start", elseifDoc, 1);
  mode.autoOutdent("start", elseDoc, 1);
  mode.autoOutdent("start", endforDoc, 1);
  mode.autoOutdent("start", endwhileDoc, 1);
  mode.autoOutdent("start", endtryDoc, 1);
  mode.autoOutdent("start", exceptDoc, 1);
  mode.autoOutdent("start", finallyDoc, 2);
  mode.autoOutdent("start", endforkDoc, 1);

  assert.equal(endifDoc.lines[1], "endif");
  assert.equal(elseifDoc.lines[1], "elseif (y)");
  assert.equal(elseDoc.lines[1], "else");
  assert.equal(endforDoc.lines[1], "endfor");
  assert.equal(endwhileDoc.lines[1], "endwhile");
  assert.equal(endtryDoc.lines[1], "endtry");
  assert.equal(exceptDoc.lines[1], "except err (ANY)");
  assert.equal(finallyDoc.lines[2], "  finally");
  assert.equal(endforkDoc.lines[1], "endfork");
  assert.equal(mode.createWorker(), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { projectOutputRow } from "../../src/client/features/context-menus/output.js";
import { CONTEXT_UNDERLINE, actionableContextRanges, createContextUnderlines, supportsContextUnderlines } from "../../src/client/features/context-menus/underlines.js";

function browser(t, html) {
  const { window } = new JSDOM(html);
  window.Highlight = Set;
  window.CSS = { highlights: new Map() };
  t.after(() => window.close());
  return window;
}

test("underline intervals respect priority, unavailable actions and gaps without matching regex again", () => {
  const matches = [{ start: 2, end: 5, enabled: false }, { start: 0, end: 8, enabled: true }, { start: 10, end: 12, enabled: true }];
  assert.deepEqual(actionableContextRanges(matches, (match) => match.enabled), [{ start: 0, end: 2 }, { start: 5, end: 8 }, { start: 10, end: 12 }]);
  assert.deepEqual(actionableContextRanges(matches, () => true), [{ start: 0, end: 8 }, { start: 10, end: 12 }]);
  assert.deepEqual(actionableContextRanges(matches, () => false), []);
  assert.deepEqual(actionableContextRanges([], () => true), []);
});

test("paint-only underlines cross ANSI and Find spans, skip links, reuse ranges and preserve DOM selection", (t) => {
  const win = browser(t, "<div id='row'>Plain <span class='all-copy'>#12</span><span class='ansi'>3:inspect</span> <a href='https://example.test'>#999</a></div>");
  const row = win.document.querySelector("#row");
  const before = row.innerHTML;
  const selection = win.document.getSelection();
  selection.selectAllChildren(row);
  const selected = selection.toString();
  const manager = createContextUnderlines(win);
  assert.equal(supportsContextUnderlines(win), true);
  manager.update(row, projectOutputRow(row), [{ start: 6, end: 18 }, { start: 19, end: 23 }]);
  const highlight = win.CSS.highlights.get(CONTEXT_UNDERLINE);
  assert.equal([...highlight].map((range) => range.toString()).join(""), "#123:inspect");
  assert.equal(row.innerHTML, before);
  assert.equal(selection.toString(), selected);
  const ranges = [...highlight];
  manager.update(row, projectOutputRow(row), [{ start: 6, end: 18 }, { start: 19, end: 23 }]);
  assert.deepEqual([...highlight], ranges);
  const find = win.document.createRange();
  find.setStart(row.querySelector(".ansi").firstChild, 0);
  find.setEnd(row.querySelector(".ansi").firstChild, 3);
  find.surroundContents(win.document.createElement("mark"));
  const marked = row.innerHTML;
  manager.update(row, projectOutputRow(row), [{ start: 6, end: 18 }, { start: 19, end: 23 }]);
  assert.equal([...highlight].map((range) => range.toString()).join(""), "#123:inspect");
  assert.equal(row.innerHTML, marked);
  manager.update(row, projectOutputRow(row), []);
  assert.equal(highlight.size, 0);
});

test("output panes share a document highlight without clearing each other and release unmounted rows", (t) => {
  const win = browser(t, "<div id='main'>#123</div><div id='secondary'>#456</div>");
  const main = win.document.querySelector("#main");
  const secondary = win.document.querySelector("#secondary");
  const first = createContextUnderlines(win);
  const second = createContextUnderlines(win);
  const intervals = [{ start: 0, end: 4 }];
  first.update(main, projectOutputRow(main), intervals);
  second.update(secondary, projectOutputRow(secondary), intervals);
  const highlight = win.CSS.highlights.get(CONTEXT_UNDERLINE);
  assert.equal(highlight.size, 2);
  second.prune([secondary]);
  assert.equal(highlight.size, 2);
  first.clear();
  assert.deepEqual([...highlight].map((range) => range.toString()), ["#456"]);
  secondary.remove();
  second.prune([]);
  assert.equal(highlight.size, 0);
  first.prune([]);
  first.update(main, projectOutputRow(main), intervals);
  assert.deepEqual([...highlight].map((range) => range.toString()), ["#123"]);
  first.clear();
  second.clear();
});

test("unsupported browsers leave output unchanged", (t) => {
  const { window } = new JSDOM("<div id='row'>#123</div>");
  t.after(() => window.close());
  assert.equal(supportsContextUnderlines(window), false);
  const row = window.document.querySelector("#row");
  const manager = createContextUnderlines(window);
  manager.update(row, projectOutputRow(row), [{ start: 0, end: 4 }]);
  manager.prune([]);
  manager.clear();
  assert.equal(row.innerHTML, "#123");
});

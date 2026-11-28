import test from "node:test";
import assert from "node:assert/strict";
import { OutputHistory, recordText, splitRunsIntoLines } from "../../src/client/features/output-windows/history.js";
import { copyOutputSelection } from "../../src/client/features/output-windows/selection.js";
import { HeightIndex } from "../../src/client/features/output-windows/height-index.js";
import { SearchResults } from "../../src/client/features/output-windows/search-results.js";
import { createAnsiRenderer } from "../../src/client/features/terminal/ansi-renderer.js";
import { exportSnapshot, searchSnapshot } from "../../src/client/features/output-windows/history-tools.js";
import { normalizeOutputWindows, outputWindowDefaults, validateOutputRule } from "../../src/shared/output-windows.js";
import { createInputQueue, forEachChunked } from "../../src/client/features/output-windows/work-queue.js";

const runs = (text) => [{ text, classes: [], inlineStyles: [] }];

test("history snapshots retain a stable boundary without duplicating record content", () => {
  const history = new OutputHistory();
  const first = history.append(runs("first"));
  for (let i = 1; i < 600; i++) history.append(runs("line " + i));
  const snapshot = history.snapshot();
  history.append(runs("later"));
  history.prune(1);
  assert.equal(history.length, 1);
  assert.equal(history.get(first.id), undefined);
  assert.equal([...snapshot][0], first);
  assert.equal([...snapshot].length, 600);
  history.clear();
  assert.equal([...history.snapshot()].length, 0);
  assert.equal(history.epoch, 1);
  assert.equal([...snapshot].length, 600);
  assert.ok(history.append(runs("new")).id > 600);
  assert.equal(recordText(history.get(history.next - 1)), "new");
  assert.equal([...history.snapshot()].length, 1);
});

test("history prunes marked blocks together and leaves unlimited history intact", () => {
  const history = new OutputHistory();
  const group = {};
  history.append(runs("before"));
  history.append(runs("map one"), { group });
  history.append(runs("map two"), { group });
  history.append(runs("after"));
  assert.equal(history.prune(0), 0);
  assert.equal(history.prune(2), 3);
  assert.deepEqual([...history.snapshot()].map(recordText), ["after"]);
  assert.equal(history.prune(5), 0);
});

test("pruning treats blocks with interleaved local output as complete chronological spans", () => {
  for (const limit of [3, 4, 5]) {
    const history = new OutputHistory();
    const group = {};
    for (let i = 0; i < 3; i++) history.append(runs("map " + i), { group });
    history.append(runs(">look"), { echo: true });
    for (let i = 3; i < 6; i++) history.append(runs("map " + i), { group });
    history.append(runs("after"));
    const snapshot = history.snapshot();
    assert.equal(history.prune(limit), 7);
    assert.deepEqual([...history.snapshot()].map(recordText), ["after"]);
    assert.equal(group.discarded, true);
    assert.equal([...snapshot].length, 8, "an export already in progress keeps its complete boundary");
    assert.equal(history.groups.filter(Boolean).length, 0);
  }
});

test("removing an entire arriving block prefix marks its future lines discarded and releases its index", () => {
  const history = new OutputHistory();
  const group = {};
  history.append(runs("map"), { group });
  history.append(runs(">one"), { echo: true });
  history.append(runs(">two"), { echo: true });
  history.prune(1);
  assert.equal(group.discarded, true);
  assert.deepEqual([...history.snapshot()].map(recordText), [">two"]);
  for (let i = 0; i < 10_000; i++) {
    history.append(runs("block " + i), { group: {} });
    history.prune(1);
  }
  assert.ok(history.groups.length <= 4097, "pruning releases block metadata and bounds empty index slots");
  history.clear();
  assert.equal(history.groups.length, 0);
  assert.equal(history.groupHead, 0);
});

test("ANSI runs split into logical lines with state and blank lines preserved", () => {
  const ansi = createAnsiRenderer();
  const lines = splitRunsIntoLines(ansi.renderRuns("\u001b[31mred\n\nnext\u001b[0m plain\n"));
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[1], []);
  assert.equal(recordText({ runs: lines[0] }), "red");
  assert.equal(recordText({ runs: lines[2] }), "next plain");
  assert.deepEqual(lines[0][0].classes, lines[2][0].classes);
  assert.equal(splitRunsIntoLines(ansi.renderRuns("last")).length, 1);
});

test("height index supports measured rows, offsets, pruning and compaction", () => {
  const index = new HeightIndex(10);
  for (let id = 1; id <= 10_000; id++) index.append({ id });
  assert.equal(index.total, 100_000);
  index.measure(0, 40);
  assert.equal(index.offsetIndex(39), 0);
  assert.equal(index.offsetIndex(40), 1);
  assert.equal(index.prefix(2), 50);
  assert.equal(index.indexOfId(9000), 8999);
  assert.equal(index.indexOfId(10001), -1);
  const backingRows = index.rows;
  index.prune(4500);
  assert.ok(index.rows === backingRows, "keep the backing array while most rows are still retained");
  index.prune(7000);
  assert.equal(index.length, 3001);
  assert.equal(index.total, 30_010);
  assert.equal(index.at(0).id, 7000);
  assert.ok(index.rows.length <= index.length * 2, "mostly pruned scrollback releases its backing row slots");
  assert.equal(index.offsetIndex(1e9), 3000);
  index.measure(-1, 20);
  index.measure(0, 0);
  assert.equal(index.total, 30_010);
  index.prune(10001);
  assert.equal(index.offsetIndex(0), 0);
});

test("height index keeps offsets relative to live scrollback after partial pruning", () => {
  const index = new HeightIndex();
  const checkLayout = (rows) => {
    assert.equal(index.length, rows.length);
    let top = 0;
    for (const [position, [id, height]] of rows.entries()) {
      assert.equal(index.at(position).id, id);
      assert.equal(index.indexOfId(id), position);
      assert.equal(index.prefix(position), top);
      assert.equal(index.offsetIndex(top), position);
      assert.equal(index.offsetIndex(top + height - 0.25), position);
      top += height;
    }
    assert.equal(index.prefix(rows.length), top);
    assert.equal(index.total, top);
    assert.equal(index.offsetIndex(-10), 0);
    assert.equal(index.offsetIndex(top + 10), rows.length - 1);
  };

  index.append({ id: 10 }, 21);
  index.append({ id: 20 }, 7.5);
  index.append({ id: 40 }, 31);
  index.append({ id: 80 }, 12);
  checkLayout([[10, 21], [20, 7.5], [40, 31], [80, 12]]);

  const backingRows = index.rows;
  index.prune(15);
  assert.equal(index.indexOfId(10), -1);
  assert.equal(index.indexOfId(30), -1);
  index.measure(index.length, 999);
  index.append({ id: 90 });
  index.measure(1, 42.5);
  index.measure(3, 19);
  checkLayout([[20, 7.5], [40, 42.5], [80, 12], [90, 19]]);

  index.prune(41);
  assert.ok(index.rows === backingRows, "small prunes advance a cursor without copying the backing array");
  checkLayout([[80, 12], [90, 19]]);
});

test("search, copy and HTML exports include unmounted history in arrival order", async () => {
  const history = new OutputHistory();
  history.append(runs("Alpha <script>alert(1)</script>"));
  const group = {};
  history.append(runs("map  one"), { group });
  history.append(runs("map  two"), { group });
  history.append(runs("alpha alpha"), { secondary: true });
  const snapshot = history.snapshot();
  history.append(runs("not in snapshot"));
  const matches = await searchSnapshot(snapshot, "alpha");
  assert.equal(matches.length, 3);
  assert.equal((await searchSnapshot(snapshot, "Alpha", { matchCase: true })).length, 1);
  assert.equal((await searchSnapshot(snapshot, "", {})).length, 0);
  assert.equal(await copyOutputSelection(snapshot, { start: { id: 1, offset: 0 }, end: { id: 4, offset: 11 } }, { scope: (record) => record.secondary }), "alpha alpha");
  assert.equal(await copyOutputSelection(history.snapshot(3, 2), { start: { id: 2, offset: 0 }, end: { id: 3, offset: 8 } }), "map  one\nmap  two");
  const client = { preferences: { sdwcNowrapBlocks: true }, parseYouTubeID: () => false };
  const parts = await exportSnapshot(snapshot, { client, css: "body{}", inlineCss: true });
  const html = parts.join("");
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /sdwc-nowrap-block/);
  assert.ok(html.indexOf("Alpha") < html.indexOf("map  one"));
  assert.ok(html.indexOf("map  two") < html.indexOf("alpha alpha"));
  assert.ok(!html.includes("not in snapshot"));
  assert.ok(!html.includes("output-spacer"));
  assert.match((await exportSnapshot(snapshot, { client, inlineCss: false })).join(""), /stylesheet/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(copyOutputSelection(snapshot, { start: { id: 1, offset: 0 }, end: { id: 4, offset: 11 } }, { signal: controller.signal }), { name: "AbortError" });
});

test("option normalization rejects malformed rules and preserves disabled feature preferences", () => {
  assert.equal(validateOutputRule({}).rule, undefined);
  assert.equal(validateOutputRule({ id: "x", name: "X", pattern: "[", ignoreCase: false }).rule, undefined);
  assert.equal(normalizeOutputWindows({}).valid, false);
  assert.equal(normalizeOutputWindows(null).valid, false);
  const value = {
    ...outputWindowDefaults(), open: true, position: "bottom", secondarySize: 100,
    selected: ["custom-one", "custom-one", 3],
    custom: [
      { id: "custom-one", name: " One ", pattern: "^hi", ignoreCase: true },
      { id: "custom-one", name: "Duplicate", pattern: "^hi" },
      { id: "preset-id", name: "Invalid custom ID", pattern: "^hi" },
      { id: "custom-bad", name: "Broken", pattern: "[" }
    ]
  };
  const checked = normalizeOutputWindows(value);
  assert.equal(checked.skipped, 3);
  assert.equal(checked.value.custom.length, 1);
  assert.equal(checked.value.custom[0].name, "One");
  assert.equal(checked.value.secondarySize, 85);
  assert.deepEqual(checked.value.selected, ["custom-one"]);
});

test("input work is ordered, chunked and cancellable; failed tasks do not stop later work", async () => {
  const received = [];
  const errors = [];
  const queue = createInputQueue({ onError: (error) => errors.push(error.message) });
  queue.text("a".repeat(20_000), (part, context) => received.push([part.length, context]), "snapshot");
  queue.task(() => { throw new Error("bad task"); });
  queue.task(() => received.push("last"));
  await queue.idle();
  assert.deepEqual(received, [[8192, "snapshot"], [8192, "snapshot"], [3616, "snapshot"], "last"]);
  assert.deepEqual(errors, ["bad task"]);
  queue.task(() => received.push("discarded"));
  queue.clear();
  await queue.idle();
  assert.equal(received.includes("discarded"), false);
  let now = 0;
  const visited = [];
  await forEachChunked(Array.from({ length: 130 }, (_, i) => i), (i) => visited.push(i), { now: () => now += 10 });
  assert.equal(visited.length, 130);
});

test("input chunk boundaries preserve CRLF and complete Unicode characters", async () => {
  const queue = createInputQueue();
  const parts = [];
  const unicode = "\uFEFF" + "a".repeat(8190) + "💡" + "\r\n" + "remaining";
  queue.text(unicode, (part) => parts.push(part));
  await queue.idle();
  assert.equal(parts.join(""), unicode);
  const crlf = "a".repeat(8191) + "\r\n";
  const windows = [];
  queue.text(crlf, (part) => windows.push(part));
  await queue.idle();
  assert.equal(windows.join(""), crlf);
  assert.ok(windows[0].endsWith("\r\n"));
});

test("ranged snapshots start at the requested chunk and keep stable boundaries across pruning and clear", () => {
  const history = new OutputHistory();
  for (let id = 1; id <= 100_000; id++) history.append(runs("row " + id));
  let chunkReads = 0;
  const get = history.chunks.get.bind(history.chunks);
  history.chunks.get = (key) => { chunkReads++; return get(key); };
  const tail = history.snapshot(undefined, 99_999);
  assert.equal(chunkReads, 1);
  assert.deepEqual([...tail].map((record) => record.id), [99_999, 100_000]);
  history.append(runs("later"));
  history.prune(1);
  history.clear();
  assert.equal(tail.get(100_000).id, 100_000);
  assert.equal(tail.get(100_001), undefined);
  assert.deepEqual([...tail].map((record) => record.id), [99_999, 100_000]);
  assert.deepEqual([...history.snapshot(undefined, 200_000)], []);
});

test("common-term Find stores counts per row and resolves navigation offsets on demand", async () => {
  const history = new OutputHistory();
  const text = "The street is busy. Several people see the vehicle disappear around the corner.";
  for (let id = 1; id <= 20_000; id++) history.append(runs(text));
  const matches = await searchSnapshot(history.snapshot(), "e", { getRecord: (id) => history.get(id) });
  const positions = [...text.matchAll(/e/giu)].map((match) => match.index);
  assert.equal(matches.length, positions.length * 20_000);
  assert.ok(matches.byteLength < 350_000, "location index uses 16 bytes per matching row, not per occurrence");
  assert.deepEqual(matches.at(0), { id: 1, start: positions[0], length: 1 });
  assert.deepEqual(matches.at(positions.length - 1), { id: 1, start: positions.at(-1), length: 1 });
  assert.equal(matches.at(matches.length - 1).id, 20_000);
  assert.equal(matches.at(matches.length), undefined);
  assert.deepEqual(matches.at(positions.length + 1), { id: 2, start: positions[1], length: 1 });
  const next = history.append(runs("e e"));
  await matches.append(await searchSnapshot(history.snapshot(undefined, next.id), "e"));
  assert.deepEqual(matches.at(matches.length - 1), { id: next.id, start: 2, length: 1 });
  history.prune(10);
  matches.prune(history.first);
  assert.equal(matches.length, positions.length * 9 + 2);
  assert.equal(matches.at(0).id, history.first);
  assert.ok(matches.byteLength <= 32_768);
  matches.prune(history.next);
  assert.equal(matches.length, 0);
  assert.equal(matches.byteLength, 0);
  const newest = history.append(runs("e"));
  await matches.append(await searchSnapshot(history.snapshot(undefined, newest.id), "e"));
  assert.deepEqual(matches.at(0), { id: newest.id, start: 0, length: 1 });
});

test("output search finds literal occurrences in either direction after pruning", async () => {
  const history = new OutputHistory();
  const text = "go [X]+ then [x]+ after [X]+";
  const original = history.append(runs(text));
  const first = new SearchResults("[X]+", true, (id) => history.get(id));
  const options = { matchCase: true, getRecord: (id) => history.get(id) };

  // matchAll also verifies that the counting expression can advance globally.
  assert.deepEqual([...text.matchAll(first.expression())].map((match) => match.index), [3, 24]);
  const insensitive = new SearchResults("[X]+", false, options.getRecord);
  assert.deepEqual([...text.matchAll(insensitive.expression())].map((match) => match.index), [3, 13, 24]);
  first.add(original.id, 2);
  assert.equal(first.byteLength, 1024 * 2 * Float64Array.BYTES_PER_ELEMENT);
  assert.equal(first.at(-1), undefined);
  assert.equal(first.at(2), undefined);
  assert.deepEqual(first.at(1), { id: original.id, start: 24, length: 4 });
  assert.deepEqual(first.at(0), { id: original.id, start: 3, length: 4 });
  assert.deepEqual(first.at(0), { id: original.id, start: 3, length: 4 });

  const next = history.append(runs(text));
  await first.append(await searchSnapshot(history.snapshot(undefined, next.id), "[X]+", options));
  history.prune(1);
  assert.equal(first.at(0), undefined, "a result whose text is no longer retained is skipped");
  first.prune(next.id);
  assert.equal(first.length, 2);
  assert.deepEqual(first.at(0), { id: next.id, start: 3, length: 4 });
});

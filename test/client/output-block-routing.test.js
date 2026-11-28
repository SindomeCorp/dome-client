import test from "node:test";
import assert from "node:assert/strict";
import { createOutputApp, FakeRuleWorker } from "../../test-support/output-app.js";
import { recordText } from "../../src/client/features/output-windows/history.js";
import { exportSnapshot } from "../../src/client/features/output-windows/history-tools.js";
import { createRuleRunner } from "../../src/client/features/output-windows/rule-runner.js";

const start = "#$# SDWC-START-NOWRAP\n";
const end = "#$# SDWC-END-NOWRAP\n";
const lines = (view) => Array.from({ length: view.index.length }, (_, i) => recordText(view.index.at(i)));

test("panel routing uses group decisions and respects the captured split generation", async (t) => {
  const { manager } = await createOutputApp(t);
  const fromClosedSplit = { generation: manager.routeState().generation, secondary: true };
  assert.equal(manager.panelFor(fromClosedSplit), "main");

  manager.updateSettings({ open: true });
  const opened = manager.routeState();
  const routed = { generation: opened.generation, secondary: true };
  assert.equal(manager.panelFor(fromClosedSplit), "main");
  assert.equal(manager.panelFor(routed), "secondary");
  assert.equal(manager.panelFor({ ...routed, group: { ...routed, secondary: false } }), "main");
  assert.equal(manager.panelFor({ ...routed, secondary: false, group: routed }), "secondary");

  manager.updateSettings({ open: false });
  assert.equal(manager.panelFor(routed), "main");
  assert.equal(manager.panelFor(routed, opened), "secondary");
});

test("output indexing releases waiters only after the new row is indexed", async (t) => {
  const { manager, win } = await createOutputApp(t);
  let ready = false;
  const watchIndex = () => {
    manager.whenIndexed().then(() => { ready = true; });
  };
  watchIndex();
  await Promise.resolve();
  assert.equal(ready, true, "idle indexing resolves immediately");

  ready = false;
  const timers = t.mock.method(win, "setTimeout", () => 1);
  manager.appendRuns([{ text: "queued output\n", classes: [], inlineStyles: [] }], { local: true });
  assert.equal(manager.views.main.index.length, 0);
  watchIndex();
  await Promise.resolve();
  assert.equal(ready, false);

  assert.equal(timers.mock.callCount(), 1);
  timers.mock.calls[0].arguments[0]();
  await Promise.resolve();
  assert.equal(ready, true);
  assert.deepEqual(lines(manager.views.main), ["queued output"]);
});

test("grid blocks route using the first nonblank ANSI-stripped line and stream before END", async (t) => {
  const { manager, client, feed } = await createOutputApp(t);
  client.preferences.sdwcNowrapBlocks = true;
  manager.updateSettings({ open: true, selected: ["grid-output"] });
  await feed("before\n" + start + "\n  \n");
  await feed("\u001b[32m[g] Header\u001b[0m\n");
  assert.deepEqual(lines(manager.views.secondary), ["", "  ", "[g] Header"]);
  await feed("[g] Body\ncontinuation without prefix\n");
  manager.appendLocal(">look\n", { echo: true });
  await manager.idle();
  await feed(end + "after\n");
  assert.deepEqual(lines(manager.views.main), ["before", ">look", "after"]);
  assert.deepEqual(lines(manager.views.secondary), ["", "  ", "[g] Header", "[g] Body", "continuation without prefix"]);
  const view = manager.views.secondary;
  view.render();
  assert.equal(view.rows.querySelectorAll(".output-nowrap-row").length, 5);
  assert.equal(view.index.at(0).group, view.index.at(4).group);
  const html = (await exportSnapshot(await manager.snapshot(), { client })).join("");
  assert.match(html, /sdwc-nowrap-block/);
  assert.match(html, /xterm256-Green/);
  assert.ok(html.indexOf("Header") < html.indexOf("Body"));
  assert.ok(html.indexOf("Body") < html.indexOf("&gt;look"));
  assert.ok(html.indexOf("&gt;look") < html.indexOf("after"));
});

test("blank-only blocks finish in main and later matching lines cannot split a nonmatching block", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["grid-output"] });
  await feed(start + "\n \n" + end + start + "ordinary header\n[g] later match\n" + end);
  assert.deepEqual(lines(manager.views.main), ["", " ", "ordinary header", "[g] later match"]);
  assert.equal(manager.views.secondary.index.length, 0);
});

test("block routing survives filter changes and close/reopen keeps the whole old block in main", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["grid-output"] });
  await feed(start + "[g] first\n");
  manager.updateSettings({ selected: [] });
  await feed("[g] second\n");
  assert.equal(manager.views.secondary.index.length, 2);
  manager.closeSplit();
  manager.updateSettings({ open: true, selected: ["grid-output"] });
  await feed("[g] third\n" + end + start + "[g] new block\n" + end);
  assert.deepEqual(lines(manager.views.main), ["[g] first", "[g] second", "[g] third"]);
  assert.deepEqual(lines(manager.views.secondary), ["[g] new block"]);
});

test("routing is independent of nowrap display and frozen when the START marker arrives", async (t) => {
  const { manager, client, feed } = await createOutputApp(t);
  client.preferences.sdwcNowrapBlocks = false;
  await feed(start);
  manager.updateSettings({ open: true, selected: ["grid-output"] });
  await feed("[g] started while closed\n" + end + start + "[g] started while open\n" + end);
  assert.deepEqual(lines(manager.views.main), ["[g] started while closed"]);
  assert.deepEqual(lines(manager.views.secondary), ["[g] started while open"]);
  assert.equal(manager.views.secondary.rows.querySelector(".output-nowrap-row"), null);
});

test("queued block data keeps the filters active when it arrived", async (t) => {
  const { manager, client, feed } = await createOutputApp(t);
  manager.updateSettings({ open: true, selected: ["grid-output"] });

  client.parseSocketData(start + "[g] queued header\nqueued body\n" + end);
  manager.updateSettings({ selected: [] });
  await feed("[g] later output\n");

  assert.deepEqual(lines(manager.views.secondary), ["[g] queued header", "queued body"]);
  assert.deepEqual(lines(manager.views.main), ["[g] later output"]);
});

test("the routing worker sees only eligible output and one line per block", async (t) => {
  const requests = [];
  class RecordingWorker extends FakeRuleWorker {
    postMessage(message) {
      requests.push(message.lines);
      super.postMessage(message);
    }
  }
  const { manager, feed } = await createOutputApp(t, { workerFactory: () => new RecordingWorker() });

  manager.updateSettings({ selected: ["grid-output"] });
  await feed("[g] while split is closed\n");
  manager.updateSettings({ open: true });
  await feed(start);
  manager.appendLocal("[g] matching local echo\n", { echo: true });
  await feed("[g] block first\n[g] block tail\n" + end + "[g] standalone\n");

  assert.deepEqual(requests, [["[g] block first"], ["[g] standalone"]]);
  assert.deepEqual(lines(manager.views.main), ["[g] while split is closed", "[g] matching local echo"]);
  assert.deepEqual(lines(manager.views.secondary), ["[g] block first", "[g] block tail", "[g] standalone"]);
});

test("large streaming blocks test only one line and prune as whole units", async (t) => {
  const requests = [];
  class CountingWorker extends FakeRuleWorker {
    postMessage(message) { requests.push(message.lines); super.postMessage(message); }
  }
  const { manager, client, feed } = await createOutputApp(t, { workerFactory: () => new CountingWorker() });
  manager.updateSettings({ open: true, selected: ["grid-output"] });
  await feed(start);
  for (let batch = 0; batch < 4; batch++) {
    await feed(Array.from({ length: 5000 }, (_, i) => "[g] row " + (batch * 5000 + i)).join("\n") + "\n");
  }
  assert.deepEqual(requests, [["[g] row 0"]]);
  assert.equal(manager.views.secondary.index.length, 20_000);
  assert.ok(manager.views.secondary.mounted.size < 150);
  client.preferences.performanceBuffer = 10;
  manager.prune();
  await feed("[g] discarded suffix\n" + end + "after\n");
  assert.equal(manager.views.secondary.index.length, 0);
  assert.deepEqual([...manager.history.snapshot()].map(recordText), ["after"]);
});

test("a stalled block decision falls back to main in order and stays there", async (t) => {
  const { manager, feed } = await createOutputApp(t);
  manager.runner.cancel();
  manager.runner = createRuleRunner({
    timeoutMs: 15,
    workerFactory: () => ({ addEventListener() {}, postMessage() {}, terminate() {} }),
    onError: (message) => manager.report(message)
  });
  manager.updateSettings({ open: true, selected: ["grid-output"] });
  await feed("before\n" + start + "[g] first\n[g] second\n");
  await feed("[g] third\n" + end + "after\n");
  assert.deepEqual(lines(manager.views.main), ["before", "[g] first", "[g] second", "[g] third", "after"]);
  assert.equal(manager.views.secondary.index.length, 0);
});

test("clear during a pending decision releases the old block and reconnect ends routing inheritance", async (t) => {
  const workers = [];
  class HeldWorker extends FakeRuleWorker {
    postMessage(message) { this.message = message; }
    release() { super.postMessage(this.message); }
  }
  const { manager, client, feed } = await createOutputApp(t, { workerFactory: () => {
    const worker = new HeldWorker(); workers.push(worker); return worker;
  } });
  manager.updateSettings({ open: true, selected: ["grid-output"] });
  client.parseSocketData(start + "[g] discarded\n");
  await manager.inputQueue.idle();
  manager.clear();
  workers[0].release();
  manager.updateSettings({ selected: [] });
  await feed("after clear\n");
  assert.deepEqual(lines(manager.views.main), ["after clear"]);
  manager.updateSettings({ selected: ["grid-output"] });
  client.parseSocketData(start + "[g] before reconnect\n");
  await manager.inputQueue.idle();
  workers.at(-1).release();
  await manager.idle();
  client.resetOutputStream();
  await feed("ordinary output after reconnect\n");
  assert.deepEqual(lines(manager.views.secondary), ["[g] before reconnect"]);
  assert.deepEqual(lines(manager.views.main), ["after clear", "ordinary output after reconnect"]);
});

test("transport reset drops stale queued output even with context menus disabled", async (t) => {
  const { manager, client, feed } = await createOutputApp(t);
  await feed("retained history\n");
  assert.equal(client.contextMenus, undefined);

  client.parseSocketData("stale data from old transport\n");
  client.resetOutputStream();
  await feed("fresh data\n");

  assert.deepEqual(lines(manager.views.main), ["retained history", "fresh data"]);
});

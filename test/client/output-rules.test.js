import test from "node:test";
import assert from "node:assert/strict";
import { createRuleRunner } from "../../src/client/features/output-windows/rule-runner.js";
import { compileRules, handleRuleRequest, matchRuleLines } from "../../src/client/features/output-windows/rule-worker.js";
import { FakeRuleWorker } from "../../test-support/output-app.js";

const rules = [{ id: "chat", name: "Chat", pattern: "^\\[-\\]\\[Team-Chat\\]", ignoreCase: false }];

test("worker matches selected rules against complete lines and reports progress", () => {
  const progress = [];
  assert.deepEqual(matchRuleLines(compileRules(rules), ["[-][Team-Chat] hello", "before [-][Team-Chat]", "[-][team-chat]"], (id) => progress.push(id)), [true, false, false]);
  assert.deepEqual(progress, ["chat"]);
  const messages = [];
  handleRuleRequest({ id: 9, lines: ["[-][Team-Chat] hi"], rules, version: "test" }, (message) => messages.push(message));
  assert.deepEqual(messages, [{ id: 9, activeRule: "chat" }, { id: 9, matches: [true] }]);
  const errors = [];
  handleRuleRequest({ id: 10, lines: ["x"], rules: [{ id: "bad", pattern: "[" }], version: "bad" }, (message) => errors.push(message));
  assert.ok(errors[0].error);
});

test("runner serializes batches and cancellation resolves queued work", async () => {
  const runner = createRuleRunner({ workerFactory: () => new FakeRuleWorker() });
  const first = runner.match(["[-][Team-Chat] hi"], rules);
  const second = runner.match(["normal"], rules);
  assert.deepEqual(await first, [true]);
  assert.deepEqual(await second, [false]);
  assert.deepEqual(await runner.match([], rules), []);
  assert.deepEqual(await runner.match(["x"], []), [false]);
  const pending = runner.match(["pending"], rules);
  const queued = runner.match(["queued"], rules);
  runner.cancel();
  assert.deepEqual(await pending, [false]);
  assert.deepEqual(await queued, [false]);
});

test("a timed-out rule is suspended and unresolved output falls back to main", async () => {
  const errors = [];
  const runner = createRuleRunner({
    timeoutMs: 5,
    onError: (message, id) => errors.push({ message, id }),
    workerFactory: () => ({
      addEventListener(name, fn) { this[name] = fn; },
      postMessage(message) { this.message({ data: { id: message.id, activeRule: "chat" } }); },
      terminate() {}
    })
  });
  assert.deepEqual(await runner.match(["x"], rules), [false]);
  assert.equal(runner.suspended.has("chat"), true);
  assert.deepEqual(await runner.match(["x"], rules), [false]);
  assert.equal(errors.length, 1);
  runner.reset();
  assert.equal(runner.suspended.size, 0);
  runner.cancel();
});

test("worker startup, runtime and syntax errors fail safely", async () => {
  const errors = [];
  const unavailable = createRuleRunner({ workerFactory: () => { throw new Error("unsupported"); }, onError: (message) => errors.push(message) });
  assert.deepEqual(await unavailable.match(["x"], rules), [false]);
  const broken = createRuleRunner({
    workerFactory: () => ({
      addEventListener(name, fn) { this[name] = fn; },
      postMessage() { this.error(); },
      terminate() {}
    }), onError: (message) => errors.push(message)
  });
  assert.deepEqual(await broken.match(["x"], rules), [false]);
  const invalid = createRuleRunner({ workerFactory: () => new FakeRuleWorker(), onError: (message) => errors.push(message) });
  assert.deepEqual(await invalid.match(["x"], [{ id: "bad", pattern: "[" }]), [false]);
  assert.equal(errors.length, 3);
  unavailable.cancel();
  broken.cancel();
  invalid.cancel();
});

test("suspension drains a long routing backlog without recursive failures or lost batches", async () => {
  let errors = 0;
  const runner = createRuleRunner({
    timeoutMs: 5, onError: () => errors++,
    workerFactory: () => ({
      addEventListener(name, fn) { this[name] = fn; },
      postMessage(message) { this.message({ data: { id: message.id, activeRule: "chat" } }); },
      terminate() {}
    })
  });
  const pending = Array.from({ length: 10_000 }, () => runner.match(["unresolved"], rules));
  const matches = await Promise.all(pending);
  assert.equal(matches.length, 10_000);
  assert.ok(matches.every((batch) => batch.length === 1 && batch[0] === false));
  assert.equal(errors, 1);
  runner.cancel();
});

test("pruning cancels queued routing and releases active input without suspending rules", async () => {
  let worker;
  const errors = [];
  const runner = createRuleRunner({
    workerFactory: () => worker = {
      addEventListener(name, fn) { this[name] = fn; },
      postMessage(message) { this.sent = message; },
      terminate() {}
    },
    onError: (message) => errors.push(message)
  });
  const first = new AbortController();
  const second = new AbortController();
  const active = runner.match(["old"], rules, { signal: first.signal });
  const queued = runner.match(["also old"], rules, { signal: second.signal });
  const activeId = worker.sent.id;
  second.abort();
  first.abort();
  assert.deepEqual(await active, [false]);
  assert.deepEqual(await queued, [false]);
  assert.equal(runner.pendingLines, 0);
  const newest = runner.match(["latest"], rules);
  worker.message({ data: { id: activeId, error: "Obsolete rule failure" } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  worker.message({ data: { id: worker.sent.id, matches: [true] } });
  assert.deepEqual(await newest, [true]);
  assert.deepEqual(errors, []);
  assert.equal(runner.suspended.size, 0);
  runner.cancel();
});

test("routing queue has a fixed line budget and overflow safely stays in main", async () => {
  let worker;
  const runner = createRuleRunner({ maxPendingLines: 3, workerFactory: () => worker = {
    addEventListener(name, fn) { this[name] = fn; },
    postMessage(message) { this.sent = message; },
    terminate() {}
  } });
  const first = runner.match(["first"], rules);
  const oldest = runner.match(["old queued"], rules);
  const latest = runner.match(["latest one", "latest two"], rules);
  assert.deepEqual(await oldest, [false]);
  assert.equal(runner.pendingLines, 3);
  assert.deepEqual(await runner.match(["a", "b", "c", "d"], rules), [false, false, false, false]);
  worker.message({ data: { id: worker.sent.id, matches: [true] } });
  assert.deepEqual(await first, [true]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  worker.message({ data: { id: worker.sent.id, matches: [true, false] } });
  assert.deepEqual(await latest, [true, false]);
  assert.equal(runner.pendingLines, 0);
  runner.cancel();
});

test("a worker failure from old settings does not disable newer routing", async (t) => {
  const workers = [];
  const errors = [];
  const runner = createRuleRunner({
    onError: (message) => errors.push(message),
    workerFactory: () => {
      const worker = {
        addEventListener(name, listener) { this[name] = listener; },
        postMessage(message) { this.sent = message; },
        terminate() { this.terminated = true; }
      };
      workers.push(worker);
      return worker;
    }
  });
  t.after(() => runner.cancel());

  let oldBatch;
  runner.match(["old settings"], rules).then((matches) => { oldBatch = matches; });
  assert.deepEqual(workers[0]?.sent.lines, ["old settings"]);
  runner.reset();
  const newBatch = runner.match(["new settings"], rules);
  workers[0].error();
  assert.equal(runner.pendingLines, 1);
  await Promise.resolve();
  assert.deepEqual(oldBatch, [false]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(workers[0].terminated, true);
  assert.equal(workers.length, 2);
  workers[0].error();
  workers[1].message({ data: { id: workers[0].sent.id, matches: [false] } });
  assert.equal(runner.pendingLines, 1);
  assert.equal(workers[1].terminated, undefined);
  workers[1].message({ data: { id: workers[1].sent.id, matches: [true] } });
  assert.deepEqual(await newBatch, [true]);
  assert.deepEqual(errors, []);
});

test("the routing watchdog gives each rule its own time and suspends only the stalled rule", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const workers = [];
  const errors = [];
  const other = { id: "grid", name: "Grid", pattern: "^grid" };
  const runner = createRuleRunner({
    timeoutMs: 10,
    onError: (message, id) => errors.push({ message, id }),
    workerFactory: () => {
      const worker = {
        addEventListener(name, listener) { this[name] = listener; },
        postMessage(message) { this.sent = message; },
        terminate() { this.terminated = true; }
      };
      workers.push(worker);
      return worker;
    }
  });
  t.after(() => runner.cancel());

  const result = runner.match(["grid"], [...rules, other]);
  const first = workers[0];
  const id = first.sent.id;
  t.mock.timers.tick(8);
  first.message({ data: { id, activeRule: "grid" } });
  t.mock.timers.tick(5);
  assert.equal(first.terminated, undefined);
  assert.equal(runner.pendingLines, 1);
  first.message({ data: { id, activeRule: "chat" } });
  t.mock.timers.tick(9);
  assert.deepEqual(errors, []);
  t.mock.timers.tick(1);
  assert.equal(runner.pendingLines, 0);
  assert.equal(first.terminated, true);
  assert.deepEqual([...runner.suspended], ["chat"]);
  assert.deepEqual(errors, [{
    message: "A routing rule exceeded one second and was suspended.",
    id: "chat"
  }]);
  assert.deepEqual(await result, [false]);

  const next = runner.match(["grid"], [...rules, other]);
  const replacement = workers[1];
  assert.deepEqual(replacement.sent.rules, [other]);
  replacement.message({ data: { id: replacement.sent.id, matches: [true] } });
  assert.equal(runner.pendingLines, 0);
  t.mock.timers.tick(10);
  assert.equal(replacement.terminated, undefined);
  assert.equal(errors.length, 1);
  assert.deepEqual(await next, [true]);
});

test("the routing queue resumes after a failure with or without yielding", async (t) => {
  for (const elapsed of [7, 8]) {
    await t.test("failure at " + elapsed + " ms", async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const clock = t.mock.method(performance, "now", () => 0);
      const workers = [];
      const runner = createRuleRunner({
        workerFactory() {
          const worker = {
            addEventListener(name, listener) { this[name] = listener; },
            postMessage(message) { this.sent = message; },
            terminate() { this.terminated = true; }
          };
          workers.push(worker);
          return worker;
        }
      });
      t.after(() => runner.cancel());

      let failedBatch;
      let queuedBatch;
      runner.match(["old"], rules).then((matches) => { failedBatch = matches; });
      const grid = [{ id: "grid", name: "Grid", pattern: "^grid" }];
      runner.match(["grid"], grid).then((matches) => { queuedBatch = matches; });
      const first = workers[0];
      first.message({ data: { id: first.sent.id, activeRule: "chat" } });
      clock.mock.mockImplementation(() => elapsed);
      first.message({ data: { id: first.sent.id, error: "Fixture rule failure" } });
      assert.equal(first.terminated, true);
      assert.equal(runner.pendingLines, 1);
      assert.equal(workers.length, 1);
      await Promise.resolve();
      assert.deepEqual(failedBatch, [false]);

      if (elapsed === 8) {
        assert.equal(workers.length, 1, "yielding leaves the queue pending until the next timer");
        t.mock.timers.tick(0);
      }

      assert.equal(workers.length, 2);
      const replacement = workers[1];
      assert.deepEqual(replacement.sent.lines, ["grid"]);
      assert.deepEqual(replacement.sent.rules, grid);
      replacement.message({ data: { id: replacement.sent.id, matches: [true] } });
      assert.equal(runner.pendingLines, 0);
      await Promise.resolve();
      assert.deepEqual(queuedBatch, [true]);
    });
  }
});

test("the routing worker never acknowledges the batch and falls back at its initial deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const workers = [];
  const onError = t.mock.fn();
  const runner = createRuleRunner({
    timeoutMs: 10,
    onError,
    workerFactory() {
      const worker = {
        addEventListener(name, listener) { this[name] = listener; },
        postMessage(message) { this.sent = message; },
        terminate() { this.terminated = true; }
      };
      workers.push(worker);
      return worker;
    }
  });
  t.after(() => runner.cancel());

  let matches;
  runner.match(["silent worker"], rules).then((value) => { matches = value; });
  assert.deepEqual(workers[0]?.sent.lines, ["silent worker"]);
  t.mock.timers.tick(9);
  assert.equal(onError.mock.callCount(), 0);
  assert.equal(runner.pendingLines, 1);

  t.mock.timers.tick(1);
  assert.equal(runner.pendingLines, 0);
  assert.equal(workers[0].terminated, true);
  assert.match(onError.mock.calls[0].arguments[0], /worker did not respond/i);
  assert.equal(runner.suspended.size, 0);
  await Promise.resolve();
  assert.deepEqual(matches, [false]);

  assert.deepEqual(await runner.match(["worker unavailable"], rules), [false]);
  assert.equal(workers.length, 1);
});

test("routing worker startup fails synchronously and releases the batch", async (t) => {
  const workerFactory = t.mock.fn(() => { throw new Error("Fixture worker unavailable"); });
  const onError = t.mock.fn();
  const runner = createRuleRunner({ workerFactory, onError });
  t.after(() => runner.cancel());
  let matches;
  runner.match(["startup failure"], rules).then((value) => { matches = value; });
  assert.equal(workerFactory.mock.callCount(), 1);
  assert.equal(runner.pendingLines, 0);
  assert.match(onError.mock.calls[0].arguments[0], /unavailable in this browser/i);
  await Promise.resolve();
  assert.deepEqual(matches, [false]);
});

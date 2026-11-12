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

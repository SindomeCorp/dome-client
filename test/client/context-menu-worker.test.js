import { test } from "node:test";
import assert from "node:assert/strict";
import { createContextMatcher } from "../../src/client/features/context-menus/worker.js";

function fixture(t, timeout = 75) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const listeners = new Map();
  const postMessage = t.mock.fn();
  const terminate = t.mock.fn();
  const workerFactory = t.mock.fn(() => ({
    addEventListener: (type, listener) => listeners.set(type, listener),
    postMessage,
    terminate
  }));
  const matcher = createContextMatcher({ workerFactory, timeout });
  t.after(() => matcher.destroy());
  return {
    matcher,
    messages: () => postMessage.mock.calls.map(({ arguments: [message] }) => message),
    reply: (data) => listeners.get("message")({ data }),
    workerError: () => listeners.get("error")(),
    workerFactory,
    terminate
  };
}

async function settled(outcome) {
  // Track settling by the next event-loop turn even if a mutant leaves a job pending.
  const value = await Promise.race([outcome, new Promise((resolve) => setImmediate(resolve))]);
  assert.notEqual(value, undefined, "worker request did not settle");
  return value;
}

test("the context worker ignores malformed and stale replies without delaying the next request", async (t) => {
  const { matcher, messages, reply, workerFactory, terminate } = fixture(t);
  assert.equal(workerFactory.mock.callCount(), 0);
  const configured = matcher.request("configure", { rules: [] });
  const matched = matcher.request("match", { text: "#123" });
  void Promise.allSettled([configured, matched]);
  assert.deepEqual(messages(), [{ id: 1, type: "configure", rules: [] }]);

  reply({});
  reply(null);
  reply({ id: "1", result: "wrong ID type" });
  reply({ id: 999, result: "unrelated" });
  assert.equal(messages().length, 1);
  reply({ id: 1, result: true });
  assert.equal(await settled(configured), true);
  assert.deepEqual(messages().at(-1), { id: 2, type: "match", text: "#123" });
  reply({ id: 1, error: "stale" });
  reply({ id: 2, result: ["#123"] });
  assert.deepEqual(await settled(matched), ["#123"]);
  reply({});
  reply(null);
  t.mock.timers.tick(3000);
  assert.equal(workerFactory.mock.callCount(), 1);
  assert.equal(terminate.mock.callCount(), 0);
});

test("the context worker caps pending work and distinguishes saturation from disposal", async (t) => {
  const { matcher, messages, reply, terminate } = fixture(t);
  const jobs = Array.from({ length: 257 }, (_, index) => matcher.request("match", { text: String(index) }));
  const running = Promise.allSettled(jobs);
  const overCapacity = Promise.allSettled([matcher.request("match", { text: "overflow" })]);
  assert.equal(messages().length, 1);
  reply({ id: 1, result: "first match" });
  assert.equal(messages().at(-1)?.text, "1");
  const afterCapacityFreed = Promise.allSettled([matcher.request("match", { text: "replacement" })]);

  matcher.destroy("fixture disposed");
  const afterDisposal = Promise.allSettled([matcher.request("match", { text: "after disposal" })]);
  t.mock.timers.tick(3000);
  const [overflow] = await settled(overCapacity);
  assert.equal(overflow.status, "rejected");
  assert.equal(overflow.reason.code, "CONTEXT_MATCHER_BUSY");

  const results = await settled(running);
  assert.deepEqual(results[0], { status: "fulfilled", value: "first match" });
  assert.ok(results.slice(1).every((result) =>
    result.status === "rejected" && result.reason.message === "fixture disposed"));
  const [replacement] = await settled(afterCapacityFreed);
  assert.equal(replacement.status, "rejected");
  assert.equal(replacement.reason.message, "fixture disposed");
  const [disposed] = await settled(afterDisposal);
  assert.equal(disposed.status, "rejected");
  assert.equal(disposed.reason.code, undefined);
  assert.match(disposed.reason.message, /unavailable/);
  assert.equal(terminate.mock.callCount(), 1);
});

test("the context worker gives configuration a longer timeout and rejects queued work on match timeout", async (t) => {
  const { matcher, messages, reply, terminate } = fixture(t);
  const configured = matcher.request("configure", { rules: [] });
  const matches = Promise.allSettled([matcher.request("match", { text: "active" }), matcher.request("match", { text: "queued" })]);
  void Promise.allSettled([configured]);
  t.mock.timers.tick(2999);
  assert.equal(terminate.mock.callCount(), 0);
  assert.equal(messages().length, 1);
  reply({ id: 1, result: true });
  assert.equal(await settled(configured), true);

  t.mock.timers.tick(74);
  assert.equal(terminate.mock.callCount(), 0);
  t.mock.timers.tick(1);
  assert.equal(terminate.mock.callCount(), 1);
  assert.equal(messages().length, 2);
  for (const result of await settled(matches)) {
    assert.equal(result.status, "rejected");
    assert.match(result.reason.message, /timed out.*native menus/);
  }
});

test("the context worker pumps past a rejected job and terminates on a worker error", async (t) => {
  const { matcher, messages, reply, workerError, terminate } = fixture(t);
  const jobs = Promise.allSettled([
    matcher.request("configure", { rules: [] }),
    matcher.request("match", { text: "active" }),
    matcher.request("match", { text: "queued" })
  ]);
  reply({ id: 1, error: "configuration rejected" });
  assert.deepEqual(messages().map(({ id }) => id), [1, 2]);
  workerError();
  reply({ id: 2, result: "arrived after failure" });
  assert.deepEqual(messages().map(({ id }) => id), [1, 2]);
  assert.equal(terminate.mock.callCount(), 1);
  const results = await settled(jobs);
  assert.ok(results.every(({ status }) => status === "rejected"));
  assert.equal(results[0].reason.message, "configuration rejected");
  for (const result of results.slice(1)) {
    assert.match(result.reason.message, /worker failed[.] Native menus/);
  }
});

test("the matcher loads the browser worker as a module", async (t) => {
  const worker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const constructed = t.mock.fn();
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: class {
      constructor(url, options) { constructed(url, options); }
      addEventListener() {}
      postMessage() {}
      terminate() {}
    }
  });
  t.after(() => {
    if (worker) Object.defineProperty(globalThis, "Worker", worker);
    else delete globalThis.Worker;
  });
  const matcher = createContextMatcher();
  t.after(() => matcher.destroy());
  const pending = Promise.allSettled([matcher.request("match", { text: "#123" })]);
  assert.deepEqual(constructed.mock.calls.map(({ arguments: args }) => args), [
    ["/js/context-menus-worker.js", { type: "module" }]
  ]);
  matcher.destroy();
  const [result] = await settled(pending);
  assert.equal(result.status, "rejected");
  assert.match(result.reason.message, /matching stopped/);
});

test("a worker creation failure rejects the first request and disables further work", async (t) => {
  const workerFactory = t.mock.fn(() => { throw new Error("fixture worker unavailable"); });
  const matcher = createContextMatcher({ workerFactory });
  t.after(() => matcher.destroy());
  await assert.rejects(settled(matcher.request("match", { text: "#123" })), /fixture worker unavailable/);
  await assert.rejects(settled(matcher.request("match", { text: "#456" })), (error) => {
    assert.equal(error.code, undefined);
    assert.match(error.message, /unavailable/);
    return true;
  });
  assert.equal(workerFactory.mock.callCount(), 1);
});

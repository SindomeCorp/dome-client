import test from "node:test";
import assert from "node:assert/strict";
import { createStatusPoller } from "../../src/services/status-poller.js";

const logger = { debug() {}, warn() {} };
const serviceUrl = "https://fixture.invalid";
const response = (checked) => ({
  ok: true,
  headers: new Map([["content-type", "application/json"]]),
  text: async () => JSON.stringify({ message: "ok", cpu: 0, memory: 0, checked, users: 0, interval: 15 })
});

test("overlapping refreshes share one request and an old response cannot replace a restarted poller result", async () => {
  const pending = [];
  const poller = createStatusPoller({ serviceUrl, logger, fetchStatus: (_url, { signal }) =>
    new Promise((resolve) => pending.push({ resolve, signal })) });
  const first = poller.refresh();
  assert.equal(poller.refresh(), first);
  poller.stop();
  assert.equal(pending[0].signal.aborted, true);
  const latest = poller.refresh();
  pending[1].resolve(response(2));
  await latest;
  pending[0].resolve(response(1));
  await first;
  assert.equal(poller.get().checked, 2);
});

test("the poller gives a stalled request a deadline and reports a timeout", async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const poller = createStatusPoller({ serviceUrl, logger, timeoutMs: 5, fetchStatus: (_url, { signal }) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) });
    assert.match((await poller.refresh()).message, /too long/);
  } finally {
    clearTimeout(keepAlive);
  }
});

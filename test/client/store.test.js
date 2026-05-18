import test from "node:test";
import assert from "node:assert/strict";

async function setup(t, { fault } = {}) {
  const logs = { error: t.mock.fn(), warn: t.mock.fn(), info() {}, debug() {} };
  const loggerMock = t.mock.module("../../src/client/pages/logger.js", { defaultExport: logs });
  const data = new Map();
  const ls = {
    setItem: t.mock.fn((k, v) => { data.set(k, v); }),
    getItem: t.mock.fn((k) => (data.has(k) ? data.get(k) : null)),
    removeItem: t.mock.fn((k) => { data.delete(k); })
  };
  if (fault === "put") {
    ls.setItem.mock.mockImplementation(() => { throw new Error("fail"); });
  }
  if (fault === "get") {
    ls.getItem.mock.mockImplementation(() => { throw new Error("fail"); });
  }
  if (fault === "remove") {
    ls.removeItem.mock.mockImplementation(() => { throw new Error("fail"); });
  }
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
  const mod = await import("../../src/client/store.js?c=" + Date.now());
  loggerMock.restore();
  t.after(() => {
    delete globalThis.localStorage;
  });
  return { ...mod, logs, ls };
}

test("store lists, reads, writes, and deletes values", async (t) => {
  const { direct, put, get, remove, ls } = await setup(t);
  assert.equal(direct(), ls);
  put("a", { x: 1 });
  assert.equal(ls.setItem.mock.callCount(), 1);
  assert.equal(ls.setItem.mock.calls[0].arguments[0], "a");
  assert.equal(ls.setItem.mock.calls[0].arguments[1], JSON.stringify({ x: 1 }));
  assert.deepEqual(get("a"), { x: 1 });
  remove("a");
  assert.equal(ls.removeItem.mock.callCount(), 1);
});

test("store.put logs and returns false on error", async (t) => {
  const { put, logs } = await setup(t, { fault: "put" });
  assert.equal(put("a", 1), false);
  assert.equal(logs.error.mock.callCount(), 1);
});

test("store.get logs error on getItem failure", async (t) => {
  const { get, logs } = await setup(t, { fault: "get" });
  assert.equal(get("a"), null);
  assert.equal(logs.error.mock.callCount(), 1);
});

test("store.get warns and removes invalid JSON", async (t) => {
  const { get, logs, ls } = await setup(t);
  ls.setItem("a", "{bad");
  assert.equal(get("a"), null);
  assert.equal(logs.warn.mock.callCount(), 1);
  assert.equal(ls.removeItem.mock.callCount(), 1);
});

test("store.remove logs errors", async (t) => {
  const { remove, logs } = await setup(t, { fault: "remove" });
  remove("a");
  assert.equal(logs.error.mock.callCount(), 1);
});

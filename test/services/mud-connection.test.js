import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { connectToMud } from "../../src/services/mud-connection.js";

test("connectToMud resolves connected tcp stream and clears timeout", async (t) => {
  const stream = new EventEmitter();
  const clearTimeoutMock = t.mock.method(global, "clearTimeout", t.mock.fn());
  const timeoutMock = t.mock.method(global, "setTimeout", () => ({ unref() {} }));
  const pending = connectToMud({
    host: "example.org",
    port: 7777,
    netConnect: (options) => {
      assert.deepEqual(options, { port: 7777, host: "example.org" });
      return stream;
    }
  });
  stream.emit("connect");
  assert.equal(await pending, stream);
  assert.equal(clearTimeoutMock.mock.callCount(), 1);
  timeoutMock.mock.restore();
  clearTimeoutMock.mock.restore();
});

test("connectToMud rejects on stream error", async (t) => {
  const stream = new EventEmitter();
  t.mock.method(global, "setTimeout", () => ({ unref() {} }));
  const err = new Error("connect failed");
  const pending = connectToMud({
    host: "example.org",
    port: 7777,
    netConnect: () => stream
  });
  stream.emit("error", err);
  await assert.rejects(pending, err);
});

test("connectToMud rejects when handshake times out", async (t) => {
  const stream = new EventEmitter();
  const unref = t.mock.fn();
  t.mock.method(global, "setTimeout", (fn) => {
    fn();
    return { unref };
  });
  await assert.rejects(connectToMud({
    host: "example.org",
    port: 7777,
    netConnect: () => stream
  }), /socket connect timeout/);
  assert.equal(unref.mock.callCount(), 1);
});

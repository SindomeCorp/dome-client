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

test("connectToMud selects tls connector when requested", async (t) => {
  const stream = new EventEmitter();
  t.mock.method(global, "setTimeout", () => ({ unref() {} }));
  const netConnect = t.mock.fn();
  const tlsConnect = t.mock.fn((options) => {
    assert.deepEqual(options, { port: 7777, host: "secure.example.org" });
    return stream;
  });
  const pending = connectToMud({
    host: "secure.example.org",
    port: 7777,
    useTls: true,
    netConnect,
    tlsConnect
  });
  let ready = false;
  pending.then(() => { ready = true; });
  stream.emit("connect");
  await Promise.resolve();
  assert.equal(ready, false);
  stream.emit("secureConnect");
  assert.equal(await pending, stream);
  assert.equal(stream.listenerCount("error"), 0);
  assert.equal(netConnect.mock.callCount(), 0);
  assert.equal(tlsConnect.mock.callCount(), 1);
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
  stream.destroy = t.mock.fn();
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
  assert.equal(stream.destroy.mock.callCount(), 1);
  assert.deepEqual(stream.eventNames(), []);
});

test("canceling a pending connection destroys the transport and removes listeners", async (t) => {
  const stream = new EventEmitter();
  stream.destroy = t.mock.fn();
  const cancellation = new AbortController();
  const pending = connectToMud({ host: "fixture.invalid", port: 7777, signal: cancellation.signal, netConnect: () => stream });
  cancellation.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(stream.destroy.mock.callCount(), 1);
  assert.deepEqual(stream.eventNames(), []);
});

test("handshake events settle once and release the deadline, transport and abort listener", async (t) => {
  const cases = [
    { name: "TCP ready", event: "connect", useTls: false },
    { name: "TLS ready", event: "secureConnect", useTls: true },
    { name: "transport error", event: "error" },
    { name: "transport closes before ready", event: "close", message: "socket closed before connecting" },
    { name: "deadline", message: "socket connect timeout" },
    { name: "abort" }
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async (t) => {
      const stream = new EventEmitter();
      stream.destroy = t.mock.fn();
      const cancellation = new AbortController();
      const signal = cancellation.signal;
      const detach = t.mock.method(signal, "removeEventListener");
      const timer = { unref: t.mock.fn() };
      const schedule = t.mock.method(global, "setTimeout", () => timer);
      const clear = t.mock.method(global, "clearTimeout", () => {});
      const options = {
        host: "fixture.invalid", port: 7777, useTls: fixture.useTls,
        netConnect: () => stream, tlsConnect: () => stream, signal, timeoutMs: 321
      };
      const pending = connectToMud(options);
      let result;
      pending.then((value) => { result = { value }; }, (error) => { result = { error }; });
      assert.equal(schedule.mock.callCount(), 1);
      const [expire, delay] = schedule.mock.calls[0].arguments;
      assert.equal(delay, 321);
      assert.equal(timer.unref.mock.callCount(), 1);
      const reason = new Error("handshake canceled or failed");
      if (fixture.event) stream.emit(fixture.event, reason);
      else if (fixture.name === "abort") cancellation.abort(reason);
      else expire();
      await new Promise(setImmediate);

      const ready = fixture.event === "connect" || fixture.event === "secureConnect";
      if (ready) assert.equal(result?.value, stream);
      else if (fixture.message) assert.equal(result?.error?.message, fixture.message);
      else assert.equal(result?.error, reason);
      assert.deepEqual(stream.eventNames(), []);
      assert.deepEqual(clear.mock.calls.map(({ arguments: args }) => args), [[timer]]);
      assert.equal(detach.mock.callCount(), 1);
      assert.equal(detach.mock.calls[0].arguments[0], "abort");
      cancellation.abort();
      assert.equal(stream.destroy.mock.callCount(), ready ? 0 : 1);
    });
  }
});

test("handshake cancels before it starts or while the transport is being created", async (t) => {
  const reason = new Error("canceled during startup");
  for (const alreadyAborted of [true, false]) {
    await t.test(alreadyAborted ? "before dialing" : "while dialing", async (t) => {
      const stream = new EventEmitter();
      stream.destroy = t.mock.fn();
      const cancellation = new AbortController();
      if (alreadyAborted) cancellation.abort(reason);
      const dial = t.mock.fn(() => {
        cancellation.abort(reason);
        return stream;
      });
      const schedule = t.mock.method(global, "setTimeout", () => ({ unref() {} }));
      let rejected;
      connectToMud({ host: "fixture.invalid", port: 7777, signal: cancellation.signal, netConnect: dial })
        .catch((error) => { rejected = error; });
      await new Promise(setImmediate);
      assert.equal(rejected, reason);
      assert.equal(dial.mock.callCount(), alreadyAborted ? 0 : 1);
      assert.equal(stream.destroy.mock.callCount(), alreadyAborted ? 0 : 1);
      assert.equal(schedule.mock.callCount(), 0);
      assert.deepEqual(stream.eventNames(), []);
    });
  }
});

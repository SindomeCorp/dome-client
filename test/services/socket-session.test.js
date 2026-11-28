import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { bindSocketSession } from "../../src/services/socket-session.js";

function createSession({ shortenEnabled = true } = {}) {
  const socket = new EventEmitter();
  socket.isActive = true;
  const events = [];
  const emit = socket.emit.bind(socket);
  socket.emit = (name, ...args) => {
    events.push([name, ...args]);
    return emit(name, ...args);
  };
  socket.on("error", () => {});
  const moo = new EventEmitter();
  const writes = [];
  moo.write = (data, _encoding, cb) => {
    writes.push(data);
    if (typeof cb === "function") cb();
  };
  moo.end = () => moo.emit("end");
  const logs = [];
  const logger = {
    debug: msg => logs.push(["debug", msg]),
    error: msg => logs.push(["error", msg])
  };
  const users = [];
  bindSocketSession({
    socket,
    moo,
    logger,
    poweredBy: "tester",
    shortenEnabled,
    logUser: (_socket, label, moreFields = []) => users.push([label, ...moreFields]),
    logError: (_socket, err) => logs.push(["logError", err.message])
  });
  return { socket, moo, writes, events, logs, users };
}

test("bindSocketSession toggles url shortening only when enabled", () => {
  const enabled = createSession();
  enabled.socket.emit("shorten-on");
  assert.equal(enabled.socket.shortenUrls, true);

  const disabled = createSession({ shortenEnabled: false });
  disabled.socket.emit("shorten-on");
  assert.equal(disabled.socket.shortenUrls, undefined);
});

test("bindSocketSession writes input and emits command status", async () => {
  const session = createSession();
  session.socket.emit("input", "look");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(session.writes, ["look\r\n"]);
  assert.ok(session.events.some(event => event[0] === "status" && event[1] === "sent 4 characters"));
  assert.ok(session.events.some(event => event[0] === "status" && event[1].includes("command sent from tester")));
});

test("bindSocketSession logs connect commands and rejects null input", async () => {
  const session = createSession();
  session.socket.emit("input", "connect Alice pass");
  session.socket.emit("input", null);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(session.users, [["USR", "Alice"]]);
  assert.ok(session.events.some(event => event[0] === "error" && event[1].message === "no input"));
});

test("bindSocketSession marks quit commands inactive", async () => {
  const session = createSession();
  session.socket.emit("input", "@quit");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.moo.socketQuit, true);
  assert.equal(session.socket.isActive, false);
  assert.ok(session.events.some(event => event[0] === "disconnected"));
});

test("bindSocketSession writes @quit on active socket disconnect", () => {
  const session = createSession();
  session.socket.emit("disconnect", "closed");
  assert.equal(session.socket.isActive, false);
  assert.ok(session.writes.includes("@quit\r\n"));
  assert.deepEqual(session.users, [["BYE"]]);
});

test("bindSocketSession forwards active moo errors", () => {
  const session = createSession();
  const err = new Error("moo failed");
  session.moo.emit("error", err);
  assert.ok(session.events.some(event => event[0] === "error" && event[1] === err));
  assert.ok(session.logs.some(log => log[0] === "logError" && log[1] === "moo failed"));
});

test("player preference changes stop and resume shortening on the active connection", async () => {
  const { createClientOptionEffects } = await import("../../src/client/features/options/client-option-effects.js");
  const { forwardMudData } = await import("../../src/services/socket-data-flow.js");
  for (const shortenEnabled of [true, false]) {
    const session = createSession({ shortenEnabled });
    const effects = createClientOptionEffects({ client: { socket: session.socket } });
    const original = "https://example.test/long-original-url";
    const shortened = "https://short.test/key";
    let calls = 0;
    for (const enabled of [true, false, false, true]) {
      effects.apply("shortenUrls", enabled);
      await forwardMudData({
        socket: session.socket,
        moo: session.moo,
        logger: session.logger,
        data: Buffer.from(original),
        shortenEnabled,
        shortenUrls: async () => { calls++; return shortened; }
      });
      assert.deepEqual(session.events.at(-1), ["data", shortenEnabled && enabled ? shortened : original]);
    }
    assert.equal(calls, shortenEnabled ? 2 : 0);
  }
});

test("upstream close stops late output and reports disconnection once", async () => {
  const { forwardMudData } = await import("../../src/services/socket-data-flow.js");
  const session = createSession();
  session.socket.shortenUrls = true;
  const pending = Promise.withResolvers();
  const output = forwardMudData({
    ...session, data: Buffer.from("old output"), shortenEnabled: true, shortenUrls: () => pending.promise
  });

  session.moo.emit("close");
  session.socket.emit("input", "late input");
  pending.resolve("old shortened output");
  await output;
  session.moo.emit("end");
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(session.socket.isActive, false);
  assert.deepEqual(session.events.filter(([event]) => event === "disconnected"), [["disconnected"]]);
  assert.equal(session.events.some(([event]) => event === "data" || event === "status"), false);
  assert.deepEqual(session.writes, []);
});

test("client disconnect flushes one quit and explicitly closes the upstream", (t) => {
  const session = createSession();
  const destroySoon = t.mock.fn(() => assert.deepEqual(session.writes, ["@quit\r\n"]));
  session.moo.destroySoon = destroySoon;
  session.socket.emit("disconnect", "transport close");
  session.socket.emit("disconnect", "duplicate");

  assert.deepEqual(session.writes, ["@quit\r\n"]);
  assert.equal(destroySoon.mock.callCount(), 1);
  assert.equal(session.socket.isActive, false);
});

test("client disconnect still closes the upstream if writing quit throws", (t) => {
  const session = createSession();
  const failure = new Error("fixture could not write quit");
  session.moo.write = () => { throw failure; };
  const end = t.mock.method(session.moo, "end");
  session.socket.emit("disconnect");
  assert.equal(end.mock.callCount(), 1);
  assert.ok(session.logs.some(([event, message]) => event === "logError" && message === failure.message));
});

test("a delayed quit acknowledgement cannot disconnect or write twice", async (t) => {
  const session = createSession();
  let acknowledge;
  session.moo.write = (data, _encoding, callback) => {
    session.writes.push(data);
    acknowledge = callback;
  };
  session.moo.destroySoon = t.mock.fn();
  session.socket.emit("input", "@quit");
  session.socket.emit("disconnect");
  acknowledge();
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(session.writes, ["@quit\r\n"]);
  assert.equal(session.moo.destroySoon.mock.callCount(), 1);
  assert.equal(session.events.some(([event]) => event === "status" || event === "disconnected"), false);
});

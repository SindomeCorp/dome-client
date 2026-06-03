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

import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { forwardMudData } from "../../src/services/socket-data-flow.js";

function createContext() {
  const socket = new EventEmitter();
  const events = [];
  socket.isActive = true;
  socket.emit = (name, ...args) => {
    events.push([name, ...args]);
    return true;
  };
  const writes = [];
  const moo = {
    write(data) {
      writes.push(data);
    }
  };
  const warnings = [];
  const errors = [];
  const logger = {
    warn: (...args) => warnings.push(args),
    error: (...args) => errors.push(args)
  };
  return { socket, events, moo, writes, logger, warnings, errors };
}

test("forwardMudData emits active data without shortening", async () => {
  const context = createContext();
  await forwardMudData({
    ...context,
    data: Buffer.from("hello"),
    shortenEnabled: false,
    shortenUrls: async () => "short",
    getUserIdentity: () => "127.0.0.1"
  });
  assert.deepEqual(context.events, [["data", "hello"]]);
});

test("forwardMudData shortens data when enabled and requested", async () => {
  const context = createContext();
  context.socket.shortenUrls = true;
  await forwardMudData({
    ...context,
    data: Buffer.from("long"),
    shortenEnabled: true,
    shortenUrls: async (data) => data.toUpperCase(),
    getUserIdentity: () => "127.0.0.1"
  });
  assert.deepEqual(context.events, [["data", "LONG"]]);
});

test("forwardMudData falls back to original data when shortening fails", async () => {
  const context = createContext();
  context.socket.shortenUrls = true;
  await forwardMudData({
    ...context,
    data: Buffer.from("long"),
    shortenEnabled: true,
    shortenUrls: async () => {
      throw new Error("boom");
    },
    getUserIdentity: () => "127.0.0.1"
  });
  assert.deepEqual(context.events, [["data", "long"]]);
  assert.equal(context.warnings[0][0], "url shortening failed");
});

test("forwardMudData responds to dome-client-user marker", async () => {
  const context = createContext();
  await forwardMudData({
    ...context,
    data: Buffer.from("hi #$# dome-client-user"),
    shortenEnabled: true,
    shortenUrls: async () => "short",
    getUserIdentity: () => "127.0.0.9"
  });
  assert.deepEqual(context.writes, ["@dome-client-user 127.0.0.9\r\n"]);
  assert.deepEqual(context.events, []);
});

test("forwardMudData does not emit inactive socket data", async () => {
  const context = createContext();
  context.socket.isActive = false;
  await forwardMudData({
    ...context,
    data: Buffer.from("hidden"),
    shortenEnabled: false,
    shortenUrls: async () => "short",
    getUserIdentity: () => "127.0.0.1"
  });
  assert.deepEqual(context.events, []);
});

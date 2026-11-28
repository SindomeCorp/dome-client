import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { forwardMudData } from "../../src/services/socket-data-flow.js";
import { createTelnetIacProcessor } from "../../src/services/telnet-iac-processor.js";

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
    debug: () => {},
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

test("forwardMudData emits filtered data when Telnet IAC bytes are present", async () => {
  const context = createContext();
  await forwardMudData({
    ...context,
    data: Buffer.concat([
      Buffer.from("before"),
      Buffer.from([255, 253, 24]),
      Buffer.from("after")
    ]),
    shortenEnabled: false,
    shortenUrls: async () => "short",
    getUserIdentity: () => "127.0.0.1",
    telnetIacProcessor: createTelnetIacProcessor({ logger: context.logger })
  });
  assert.deepEqual(context.events, [["data", "beforeafter"]]);
});

test("forwardMudData emits nothing when filtering leaves only Telnet IAC bytes", async () => {
  const context = createContext();
  await forwardMudData({
    ...context,
    data: Buffer.from([255, 253, 24]),
    shortenEnabled: false,
    shortenUrls: async () => "short",
    getUserIdentity: () => "127.0.0.1",
    telnetIacProcessor: createTelnetIacProcessor({ logger: context.logger })
  });
  assert.deepEqual(context.events, []);
});

test("forwardMudData does not shorten IAC-only chunks", async () => {
  const context = createContext();
  context.socket.shortenUrls = true;
  let calls = 0;
  await forwardMudData({
    ...context,
    data: Buffer.from([255, 251, 70]),
    shortenEnabled: true,
    shortenUrls: async () => {
      calls++;
      return "short";
    },
    getUserIdentity: () => "127.0.0.1",
    telnetIacProcessor: createTelnetIacProcessor({ logger: context.logger })
  });
  assert.equal(calls, 0);
  assert.deepEqual(context.events, []);
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

test("fragmented login detection preserves a coalesced context profile and display text", async () => {
  const context = createContext();
  const options = { ...context, shortenEnabled: false, getUserIdentity: () => "127.0.0.9" };
  await forwardMudData({ ...options, data: Buffer.from("Welcome\n#$# dome-client-") });
  await forwardMudData({ ...options, data: Buffer.from("user\n#$# SDWC%%CONTEXT-PROFILE%%\"player\"\nReady\n") });
  assert.deepEqual(context.writes, ["@dome-client-user 127.0.0.9\r\n"]);
  assert.equal(context.events.map((event) => event[1]).join(""), "Welcome\n#$# SDWC%%CONTEXT-PROFILE%%\"player\"\nReady\n");
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

test("turning shortening off while a request is pending emits the original text", async () => {
  const context = createContext();
  context.socket.shortenUrls = true;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const forwarded = forwardMudData({
    ...context,
    data: Buffer.from("original URL"),
    shortenEnabled: true,
    shortenUrls: () => pending
  });
  context.socket.shortenUrls = false;
  finish("shortened URL");
  await forwarded;
  assert.deepEqual(context.events, [["data", "original URL"]]);
});

test("socket output keeps UTF-8 characters intact across TCP and Telnet splits", async () => {
  const context = createContext();
  const other = createContext();
  const wire = Buffer.from("before café 世界 🌲 after\r\n");
  const telnetIacProcessor = createTelnetIacProcessor();
  const utf8Start = wire.indexOf(0xc3);
  const stream = Buffer.concat([wire.subarray(0, utf8Start + 1), Buffer.from([255, 253, 24]), wire.subarray(utf8Start + 1)]);
  for (const byte of stream) {
    await forwardMudData({
      ...context, data: Buffer.from([byte]), shortenEnabled: false, telnetIacProcessor
    });
    await forwardMudData({
      ...other, data: Buffer.from("x"), shortenEnabled: false
    });
  }
  assert.equal(context.events.map((event) => event[1]).join(""), wire.toString());
  assert.equal(other.events.map((event) => event[1]).join(""), "x".repeat(stream.length));
});

test("server-disabled shortening passes output through despite a connection preference", async () => {
  const context = createContext();
  context.socket.shortenUrls = true;
  const shortenUrls = () => assert.fail("the disabled shortener was called");
  await forwardMudData({ ...context, data: Buffer.from("keep this"), shortenEnabled: false, shortenUrls });
  assert.deepEqual(context.events, [["data", "keep this"]]);
  assert.deepEqual(context.errors, []);
});

test("the login marker uses the resolved connection hostname when available", async (t) => {
  const context = createContext();
  context.socket.hostname = "fixture.invalid";
  const write = t.mock.method(context.moo, "write");
  await forwardMudData({
    ...context, data: Buffer.from("#$# dome-client-user\r\nnext\r\n"),
    shortenEnabled: false, getUserIdentity: () => assert.fail("unexpected fallback lookup")
  });
  assert.deepEqual(write.mock.calls[0].arguments, ["@dome-client-user fixture.invalid\r\n", "utf8"]);
  assert.deepEqual(context.events, [["data", "next\r\n"]]);
});

test("a Telnet filter failure is logged without emitting partial output", async () => {
  const context = createContext();
  const failure = new Error("fixture Telnet filter failure");
  await forwardMudData({
    ...context, data: Buffer.from("first"), telnetIacProcessor: { filter() { throw failure; } }
  });
  await forwardMudData({ ...context, data: Buffer.from("next"), shortenEnabled: false });
  assert.deepEqual(context.errors, [["exception caught when receiving data from the moo", failure]]);
  assert.deepEqual(context.events, [["data", "next"]]);
});

/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createSocket } from "../helpers/socket.js";

function makeSeededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test("integration: socket chaos lifecycle preserves quit/disconnect invariants", async (t) => {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const connections = [];
  moduleMock("node:net", {
    namedExports: {
      connect() {
        const moo = new EventEmitter();
        moo.writes = [];
        moo.write = (data, _encoding, cb) => {
          moo.writes.push(String(data));
          if (typeof cb === "function") {
            cb();
          }
          return true;
        };
        moo.end = () => {
          moo.emit("end");
        };
        connections.push(moo);
        process.nextTick(() => moo.emit("connect"));
        return moo;
      }
    }
  });
  moduleMock("node:dns", {
    namedExports: {
      promises: { reverse: async () => [] }
    }
  });
  moduleMock("../../src/config/index.js", {
    defaultExport: {
      node: { socketProxied: false, multiMud: false, poweredBy: "Dome Client" },
      moo: { host: "moo.test", port: 5555 },
      shorten: { enabled: false },
    }
  });
  moduleMock("../../src/logger.js", {
    defaultExport: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      child() {
        return this;
      }
    },
    namedExports: {
      named: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
      inspect() {}
    }
  });

  const socketController = await import(`../../src/controllers/socket.js?chaos=${Date.now()}`);
  const rng = makeSeededRng(0xC0FFEE);

  for (let trial = 0; trial < 25; trial += 1) {
    const { socket, events } = createSocket();
    await socketController.connection(socket);
    const moo = connections[trial];
    assert.ok(moo);
    let sentQuitInput = false;

    const ops = [
      () => socket.emit("input", "look"),
      () => {
        if (sentQuitInput) {
          return;
        }
        sentQuitInput = true;
        socket.emit("input", "@quit");
      },
      () => socket.emit("disconnect"),
      () => moo.emit("end"),
      () => moo.emit("error", new Error("chaos moo error")),
      () => moo.emit("data", Buffer.from("chaos line\r\n")),
      () => moo.emit("data", Buffer.from("#$# dome-client-user"))
    ];

    for (let step = 0; step < 40; step += 1) {
      const index = Math.floor(rng() * ops.length);
      ops[index]();
    }
    socket.emit("disconnect");
    await new Promise((resolve) => setImmediate(resolve));

    const quitWrites = moo.writes.filter((line) => line === "@quit\r\n");
    const allowedQuitWrites = sentQuitInput ? 2 : 1;
    assert.ok(quitWrites.length <= allowedQuitWrites, `trial ${trial} wrote @quit ${quitWrites.length} times`);

    const disconnectedEvents = events.filter((entry) => entry[0] === "disconnected");
    const allowedDisconnectedEvents = sentQuitInput ? 2 : 1;
    assert.ok(disconnectedEvents.length <= allowedDisconnectedEvents, `trial ${trial} emitted disconnected ${disconnectedEvents.length} times`);

    assert.equal(socket.isActive, false, `trial ${trial} should converge to inactive socket`);
  }

  t.mock.restoreAll();
});

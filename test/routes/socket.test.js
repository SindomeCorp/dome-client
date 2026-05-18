/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import net from "node:net";
import dns from "node:dns";
import config from "../../src/config/index.js";
import logger from "../../src/logger.js";
import nock from "nock";
import { createSocket } from "../helpers/socket.js";

let importCounter = 0;
async function loadRoute(options = {}) {
  const hadProxied = Object.prototype.hasOwnProperty.call(config.node, "socketProxied");
  const origProxied = config.node.socketProxied;
  if (Object.prototype.hasOwnProperty.call(options, "proxied")) {
    config.node.socketProxied = options.proxied;
  }
  const route = await import(`../../src/controllers/socket.js?cachebust=${importCounter++}`);
  if (hadProxied) {
    config.node.socketProxied = origProxied;
  } else {
    delete config.node.socketProxied;
  }
  return route;
}

test("error utility logs via stub logger", async (t) => {
  const messages = { error: [], debug: [] };
  const childMock = t.mock.method(logger, "child", () => ({
    error: msg => messages.error.push(msg),
    debug: msg => messages.debug.push(msg),
    info: () => {},
  }));
  const route = await loadRoute();
  const err = new Error("boom");
  route.error(err);
  assert.deepEqual(messages.error, [err]);
  assert.ok(messages.debug.includes("args:"));
  childMock.mock.restore();
});

test("handles net.connect failure", async () => {
  const moo = new EventEmitter();
  const err = new Error("connect fail");
  const original = {
    connect: net.connect,
    reverse: dns.promises.reverse,
    child: logger.child,
  };
  const errorLogs = [];
  logger.child = () => ({
    error: msg => errorLogs.push(msg),
    info: () => {},
    debug: () => {},
  });
  net.connect = () => {
    process.nextTick(() => moo.emit("error", err));
    return moo;
  };
  dns.promises.reverse = async () => ["host"];
  const route = await loadRoute();
  const { socket, events } = createSocket();
  await route.connection(socket);
  assert.ok(errorLogs.some(m => m.includes("error while connecting to moo")));
  assert.ok(events.some(e => e[0] === "error" && e[1] === err.toString()));
  net.connect = original.connect;
  dns.promises.reverse = original.reverse;
  logger.child = original.child;
});

test("userIp handles object and proxied addresses", async () => {
  const moo = new EventEmitter();
  moo.write = () => {};
  moo.end = () => {};
  const original = {
    connect: net.connect,
    reverse: dns.promises.reverse,
  };
  net.connect = () => moo;
  dns.promises.reverse = async () => [];
  const route = await loadRoute();
  const { socket } = createSocket();
  socket.handshake.address = { address: "127.0.0.1" };
  const p = route.connection(socket);
  moo.emit("connect");
  await p;
  assert.equal(socket.hostname, "127.0.0.1");
  net.connect = original.connect;
  dns.promises.reverse = original.reverse;

  const proxiedRoute = await loadRoute({ proxied: true });
  const { socket: proxiedSocket } = createSocket();
  proxiedSocket.handshake.address = "9.9.9.9";
  proxiedSocket.handshake.headers["x-forwarded-for"] = "5.6.7.8";
  assert.equal(proxiedRoute.userIp(proxiedSocket), "5.6.7.8");
});

test("logUser formats info messages", async (t) => {
  const entries = [];
  const childMock = t.mock.method(logger, "child", () => ({
    info: msg => entries.push(msg),
    error: () => {},
    debug: () => {},
  }));
  const route = await loadRoute();
  const { socket } = createSocket();
  route.logUser(socket, "HI", ["there"]);
  assert.deepEqual(entries, ["HI 127.0.0.1 there"]);
  childMock.mock.restore();
});

test("logError logs error details", async (t) => {
  const entries = [];
  const childMock = t.mock.method(logger, "child", () => ({
    error: (...args) => entries.push(args),
    info: () => {},
    debug: () => {},
  }));
  const route = await loadRoute();
  const { socket } = createSocket();
  const err = new Error("fail");
  route.logError(socket, err);
  assert.equal(entries.length, 1);
  const [msg, obj] = entries[0];
  assert.ok(msg.startsWith("ERR 127.0.0.1"));
  assert.equal(obj, err);
  childMock.mock.restore();
});

test("logUser handles error objects", async (t) => {
  const entries = [];
  const childMock = t.mock.method(logger, "child", () => ({
    error: (msg, obj) => entries.push([msg, obj]),
    info: () => {},
    debug: () => {},
  }));
  const route = await loadRoute();
  const { socket } = createSocket();
  const err = new Error("bad");
  route.logUser(socket, err, ["oops"]);
  assert.equal(entries.length, 1);
  const [msg, obj] = entries[0];
  assert.ok(msg.startsWith("ERR 127.0.0.1"));
  assert.equal(obj, err);
  childMock.mock.restore();
});

async function runDnsTest(t, proxied) {
  const infoLogs = [];
  const childMock = t.mock.method(logger, "child", () => ({
    info: msg => infoLogs.push(msg),
    error: () => {},
    debug: () => {},
  }));
  const route = await loadRoute({ proxied });
  const originals = { connect: net.connect, reverse: dns.promises.reverse };
  const moo = new EventEmitter();
  moo.write = () => {};
  net.connect = () => moo;
  dns.promises.reverse = async () => { const e = new Error("x"); e.code = "NOTFOUND"; throw e; };
  const { socket } = createSocket();
  if (proxied) {
    socket.handshake.address = "9.9.9.9";
    socket.handshake.headers["x-forwarded-for"] = "5.6.7.8";
  } else {
    socket.handshake.address = "2.3.4.5";
  }
  const p = route.connection(socket);
  moo.emit("connect");
  await p;
  const expectedIp = proxied ? "5.6.7.8" : "2.3.4.5";
  assert.ok(infoLogs.some(m => m.includes(`DNS ${expectedIp} NOTFOUND`)));
  net.connect = originals.connect;
  dns.promises.reverse = originals.reverse;
  childMock.mock.restore();
}

test("connection logs DNS error for direct IP", async (t) => {
  await runDnsTest(t, false);
});

test("connection logs DNS error for proxied IP", async (t) => {
  await runDnsTest(t, true);
});

test("dns reverse handling", async (t) => {
  await t.test("success", async () => {
    const moo = new EventEmitter();
    moo.write = () => {};
    moo.end = () => {};
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };
    const infoLogs = [];
    logger.child = () => ({
      info: msg => infoLogs.push(msg),
      error: () => {},
      debug: () => {},
    });
    net.connect = () => moo;
    dns.promises.reverse = async () => ["host.name"];
    const route = await loadRoute();
    const { socket } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;
    assert.equal(socket.hostname, "host.name");
    assert.ok(infoLogs.some(m => m.includes("DNS") && m.includes("host.name")));
    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });

  await t.test("ENOTIMP", async () => {
    const moo = new EventEmitter();
    moo.write = () => {};
    moo.end = () => {};
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };
    const debugLogs = [];
    logger.child = () => ({
      debug: msg => debugLogs.push(msg),
      info: () => {},
      error: () => {},
    });
    net.connect = () => moo;
    dns.promises.reverse = async () => { const e = new Error("x"); e.code = "ENOTIMP"; throw e; };
    const route = await loadRoute();
    const { socket } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;
    assert.ok(debugLogs.some(m => m.includes("reverse dns not implemented")));
    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });

  for (const code of ["NOTFOUND", "SERVFAIL", "TIMEOUT"]) {
    await t.test(code, async () => {
      const moo = new EventEmitter();
      moo.write = () => {};
      moo.end = () => {};
      const original = {
        connect: net.connect,
        reverse: dns.promises.reverse,
        child: logger.child,
      };
      const infoLogs = [];
      logger.child = () => ({
        info: msg => infoLogs.push(msg),
        error: () => {},
        debug: () => {},
      });
      net.connect = () => moo;
      dns.promises.reverse = async () => { const e = new Error("x"); e.code = code; throw e; };
      const route = await loadRoute();
      const { socket } = createSocket();
      const p = route.connection(socket);
      moo.emit("connect");
      await p;
      assert.ok(infoLogs.some(m => m.includes("DNS") && m.includes(code)));
      net.connect = original.connect;
      dns.promises.reverse = original.reverse;
      logger.child = original.child;
    });
  }

  await t.test("throws", async () => {
    const moo = new EventEmitter();
    moo.write = () => {};
    moo.end = () => {};
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };
    const errorLogs = [];
    logger.child = () => ({
      error: msg => errorLogs.push(msg),
      info: () => {},
      debug: () => {},
    });
    net.connect = () => moo;
    dns.promises.reverse = async () => { throw new Error("boom"); };
    const route = await loadRoute();
    const { socket } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;
    assert.ok(errorLogs.some(m => m.includes("exception while resolving name")));
    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });

  await t.test("throws synchronously", async () => {
    const moo = new EventEmitter();
    moo.write = () => {};
    moo.end = () => {};
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };
    const errorLogs = [];
    logger.child = () => ({
      error: msg => errorLogs.push(msg),
      info: () => {},
      debug: () => {},
    });
    net.connect = () => moo;
    dns.promises.reverse = () => { throw new Error("sync"); };
    const route = await loadRoute();
    const { socket } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;
    assert.ok(errorLogs.some(m => m.includes("exception while resolving name")));
    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });
});

test("moo and socket events", async (t) => {
  await t.test("handles moo end", async () => {
    const moo = new EventEmitter();
    moo.write = () => {};
    moo.end = () => {};
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };
    const debugLogs = [];
    logger.child = () => ({
      debug: msg => debugLogs.push(msg),
      info: () => {},
      error: () => {},
    });
    net.connect = () => moo;
    dns.promises.reverse = async () => ["host"];
    const route = await loadRoute();
    const { socket, events } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;
    moo.emit("end");
    assert.ok(events.some(e => e[0] === "disconnected"));
    assert.equal(socket.isActive, false);
    moo.emit("end");
    assert.ok(debugLogs.some(m => m.includes("socket is no longer active")));
    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });

  await t.test("logs socket error", async () => {
    const moo = new EventEmitter();
    moo.write = () => {};
    moo.end = () => {};
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };
    const errorLogs = [];
    logger.child = () => ({
      error: msg => errorLogs.push(msg),
      info: () => {},
      debug: () => {},
    });
    net.connect = () => { process.nextTick(() => moo.emit("connect")); return moo; };
    dns.promises.reverse = async () => ["host"];
    const route = await loadRoute();
    const { socket } = createSocket();
    await route.connection(socket);
    const err = new Error("sock");
    socket.emit("error", err);
    assert.ok(errorLogs.some(m => m.includes("socket error event occurred")));
    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });

  await t.test("moo error event respects isActive", async () => {
    const moo = new EventEmitter();
    moo.write = () => {};
    moo.end = () => {};
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
    };
    net.connect = () => moo;
    dns.promises.reverse = async () => ["host"];
    const route = await loadRoute();
    const { socket, events } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;
    const err1 = new Error("boom");
    moo.emit("error", err1);
    assert.ok(events.some(e => e[0] === "error" && e[1] === err1));
    socket.isActive = false;
    const err2 = new Error("later");
    moo.emit("error", err2);
    const errs = events.filter(e => e[0] === "error");
    assert.equal(errs.length, 1);
    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
  });

  await t.test("shorten-on toggles flag", async () => {
    const moo = new EventEmitter();
    moo.write = () => {};
    moo.end = () => {};
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
    };
    net.connect = () => { process.nextTick(() => moo.emit("connect")); return moo; };
    dns.promises.reverse = async () => ["host"];
    const route = await loadRoute();
    const { socket } = createSocket();
    await route.connection(socket);
    assert.equal(socket.shortenUrls, undefined);
    socket.emit("shorten-on");
    assert.equal(socket.shortenUrls, true);
    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
  });
});

test("socket route connection lifecycle", async (t) => {
  await t.test("forwards data and shortens URLs", async () => {
    const moo = new EventEmitter();
    moo.write = (data, enc, cb) => { if (cb) cb(); };
    moo.end = () => { moo.emit("end"); };

    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
    };
    net.connect = () => moo;
    dns.promises.reverse = async () => ["host"];

    const longUrl = "http://example.com/" + "a".repeat(60);

    const scope = nock(`http://${config.shorten.host}:${config.shorten.port}`)
      .post(config.shorten.path)
      .reply(200, { url: longUrl, key: "abc" });

    const route = await loadRoute();
    const { socket, events } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;
    assert.ok(events.some(e => e[0] === "connected"));

    moo.emit("data", Buffer.from("plain"));
    assert.ok(events.some(e => e[0] === "data" && e[1] === "plain"));
    assert.equal(scope.isDone(), false);

    socket.emit("shorten-on");
    assert.equal(socket.shortenUrls, true);
    await new Promise(resolve => {
      socket.once("data", resolve);
      moo.emit("data", Buffer.from(longUrl));
    });
    const lastData = events.filter(e => e[0] === "data").pop();
    assert.equal(lastData[1], `http://${config.shorten.domain}/abc`);
    assert.ok(scope.isDone());

    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    nock.cleanAll();
  });

  await t.test("handles moo.write throwing based on activity", async () => {
    const moo = new EventEmitter();
    const err = new Error("write fail");
    moo.write = () => { throw err; };
    moo.end = () => {};

    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };

    const errorLogs = [];
    logger.child = () => ({
      error: msg => errorLogs.push(msg),
      info: () => {},
      debug: () => {},
    });

    net.connect = () => moo;
    dns.promises.reverse = async () => ["host"];

    const route = await loadRoute();
    const { socket, events } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;

    socket.emit("input", "look");
    await new Promise(r => setImmediate(r));
    assert.ok(errorLogs.some(m => m.includes("exception while writing to moo")));
    assert.equal(errorLogs.filter(m => m === err.stack).length, 1);
    assert.ok(events.some(e => e[0] === "error" && e[1] === err));

    const errorCount = events.filter(e => e[0] === "error").length;
    socket.isActive = false;
    socket.emit("input", "look");
    await new Promise(r => setImmediate(r));
    assert.equal(errorLogs.filter(m => m === err.stack).length, 2);
    assert.equal(events.filter(e => e[0] === "error").length, errorCount);

    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });

  await t.test("handles @quit and disconnect", async () => {
    const moo = new EventEmitter();
    const writes = [];
    moo.write = (data, enc, cb) => { writes.push(data); if (cb) cb(); };
    moo.end = () => { moo.emit("end"); };

    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
    };

    net.connect = () => moo;
    dns.promises.reverse = async () => ["host"];

    const route = await loadRoute();
    const { socket, events } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;

    let writeCalled = 0;
    socket.emit("input", "@quit");
    await new Promise(r => setImmediate(r));
    writeCalled = writes.length;

    assert.equal(writeCalled, 1);
    assert.ok(writes.includes("@quit\r\n"));
    assert.ok(events.some(e => e[0] === "disconnected"));
    assert.equal(socket.isActive, false);
    assert.equal(moo.socketQuit, true);

    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
  });

  await t.test("emits status for non-quit commands", async () => {
    const moo = new EventEmitter();
    const writes = [];
    let writeCbCalled = false;
    moo.write = (data, enc, cb) => {
      writes.push(data);
      if (cb) {
        writeCbCalled = true;
        cb();
      }
    };
    moo.end = () => {};

    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
    };

    net.connect = () => moo;
    dns.promises.reverse = async () => ["host"];

    const route = await loadRoute();
    const { socket, events } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;

    socket.emit("input", "look");
    await new Promise(r => setImmediate(r));
    assert.equal(writeCbCalled, true);
    assert.ok(writes.includes("look\r\n"));
    assert.ok(events.some(e => e[0] === "status" && e[1] === "sent 4 characters"));
    assert.ok(!events.some(e => e[0] === "disconnected"));

    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
  });

  await t.test("input rejects null command", async () => {
    const moo = new EventEmitter();
    moo.write = (data, enc, cb) => { if (cb) cb(); };
    moo.end = () => {};
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
    };
    net.connect = () => moo;
    dns.promises.reverse = async () => ["host"];
    const route = await loadRoute();
    const { socket, events } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;
    socket.emit("input", null);
    const cbErr = events.find(e => e[0] === "error")[1];
    assert.equal(cbErr.message, "no input");
    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
  });

  await t.test("connect command logs user", async () => {
    const moo = new EventEmitter();
    moo.write = (data, enc, cb) => { if (cb) cb(); };
    moo.end = () => {};
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };
    const infoLogs = [];
    logger.child = () => ({
      info: msg => infoLogs.push(msg),
      error: () => {},
      debug: () => {},
    });
    net.connect = () => moo;
    dns.promises.reverse = async () => ["host"];
    const route = await loadRoute();
    const { socket } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;
    socket.emit("input", "connect Alice pass");
    assert.ok(infoLogs.some(m => m.includes("USR 127.0.0.1 Alice")));
    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });

  await t.test("disconnect event with reason writes @quit", async () => {
    const moo = new EventEmitter();
    const writes = [];
    moo.write = (data, enc, cb) => { writes.push(data); if (cb) cb(); };
    moo.end = () => {};

    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };

    const infoLogs = [];
    const debugLogs = [];
    logger.child = () => ({
      info: msg => infoLogs.push(msg),
      error: () => {},
      debug: msg => debugLogs.push(msg),
    });

    net.connect = () => moo;
    dns.promises.reverse = async () => ["host"];

    const route = await loadRoute();
    const { socket } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;

    socket.emit("shorten-on");
    assert.equal(socket.shortenUrls, true);
    assert.equal(socket.isActive, true);

    assert.equal(moo.socketQuit, undefined);
    socket.emit("disconnect", "timeout");
    assert.ok(infoLogs.some(m => m.startsWith("BYE")));
    assert.ok(debugLogs.some(m => m.includes("disconnected from client: timeout")));
    assert.ok(writes.includes("@quit\r\n"));
    assert.equal(socket.isActive, false);

    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });

  await t.test("disconnect event without reason writes @quit", async () => {
    const moo = new EventEmitter();
    const writes = [];
    moo.write = (data, enc, cb) => { writes.push(data); if (cb) cb(); };
    moo.end = () => {};

    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };

    const infoLogs = [];
    const debugLogs = [];
    logger.child = () => ({
      info: msg => infoLogs.push(msg),
      debug: msg => debugLogs.push(msg),
      error: () => {},
    });

    net.connect = () => { process.nextTick(() => moo.emit("connect")); return moo; };
    dns.promises.reverse = async () => ["host"];

    const route = await loadRoute();
    const { socket } = createSocket();
    await route.connection(socket);
    assert.equal(socket.isActive, true);

    socket.emit("disconnect");
    assert.ok(infoLogs.some(m => m.startsWith("BYE")));
    assert.equal(debugLogs.length, 0);
    assert.ok(writes.includes("@quit\r\n"));
    assert.equal(socket.isActive, false);

    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });

  await t.test("handles dome-client-user marker and data errors", async () => {
    const writes = [];
    const moo = new EventEmitter();
    moo.write = (data, enc, cb) => { writes.push(data); if (cb) cb(); };
    moo.end = () => {};

    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
    };
    const errorLogs = [];
    logger.child = () => ({
      error: msg => errorLogs.push(msg),
      info: () => {},
      debug: () => {},
    });
    net.connect = () => moo;
    dns.promises.reverse = async () => [];
    const route = await loadRoute();
    const { socket, events } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;

    moo.emit("data", Buffer.from("#$# dome-client-user"));
    assert.ok(writes.some(w => w.startsWith("@dome-client-user")));
    moo.emit("data", Buffer.from("plain"));
    assert.ok(events.some(e => e[0] === "data" && e[1] === "plain"));
    moo.emit("data", { toString() { throw new Error("bad"); } });
    assert.ok(errorLogs.some(m => m.includes("exception caught when receiving data")));

    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
  });

  await t.test("propagates error events from moo", async () => {
    const moo = new EventEmitter();
    moo.write = (data, enc, cb) => { if (cb) cb(); };
    moo.end = () => {};

    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
    };

    net.connect = () => moo;
    dns.promises.reverse = async () => ["host"];

    const route = await loadRoute();
    const { socket, events } = createSocket();
    const p = route.connection(socket);
    moo.emit("connect");
    await p;

    const err = new Error("boom");
    moo.emit("error", err);
    assert.ok(events.some(e => e[0] === "error" && e[1] === err));

    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
  });

  await t.test("logs proxied address and device", async () => {
    const moo = new EventEmitter();
    const writes = [];
    moo.write = (data, enc, cb) => { writes.push(data); if (cb) cb(); };
    moo.end = () => {};

    const hadProxied = Object.prototype.hasOwnProperty.call(config.node, "socketProxied");
    const original = {
      connect: net.connect,
      reverse: dns.promises.reverse,
      child: logger.child,
      socketProxied: config.node.socketProxied,
    };

    const infoLogs = [];
    const errorLogs = [];
    logger.child = () => ({
      info: msg => infoLogs.push(msg),
      error: msg => errorLogs.push(msg),
      debug: () => {},
    });

    net.connect = () => moo;
    dns.promises.reverse = async () => ["resolved.host"];

    config.node.socketProxied = true;

    const route = await loadRoute();
    const socket = new EventEmitter();
    socket.handshake = {
      address: { address: "1.2.3.4" },
      headers: {
        "x-forwarded-for": "5.6.7.8",
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1",
        referer: "",
      }
    };

    const p = route.connection(socket);
    moo.emit("connect");
    await p;
    assert.ok(infoLogs.some(m => m.includes("5.6.7.8") && m.includes("iPhone")));

    const err = new Error("fail");
    moo.emit("error", err);
    assert.ok(errorLogs.some(m => m.includes("ERR 5.6.7.8") && m.includes("iPhone")));

    moo.emit("data", Buffer.from("#$# dome-client-user"));
    assert.ok(writes.includes("@dome-client-user resolved.host\r\n"));

    net.connect = original.connect;
    dns.promises.reverse = original.reverse;
    logger.child = original.child;
    if (hadProxied) {
      config.node.socketProxied = original.socketProxied;
    } else {
      delete config.node.socketProxied;
    }
  });
});


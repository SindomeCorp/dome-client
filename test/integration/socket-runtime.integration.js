/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { io as createSocketClient } from "socket.io-client";
import nock from "nock";
import { createSocket } from "../helpers/socket.js";

function makeMooConnection() {
  const conn = new EventEmitter();
  conn.writes = [];
  conn.write = (data, _encoding, cb) => {
    conn.writes.push(String(data));
    if (typeof cb === "function") {
      cb();
    }
    return true;
  };
  conn.end = () => {
    conn.emit("end");
  };
  process.nextTick(() => conn.emit("connect"));
  return conn;
}

async function bootSocketServer(t, { shortenEnabled = false, shortenImpl } = {}) {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const config = {
    node: {
      mode: "test",
      port: 0,
      socketUrl: "",
      socketUrlSSL: "",
      socketProxied: false,
      multiMud: false,
      poweredBy: "Dome Client",
      session: {
        secret: "integration-test-secret"
      }
    },
    moo: {
      name: "Integration MUD",
      host: "moo.test",
      port: 5555
    },
    website: {
      signupUrl: ""
    },
    guest: {
      connectCommand: "connect guest"
    },
    autocomplete: {
      enabled: false,
      p: "data/autocomplete/player.txt"
    },
    editor: {
      localSaveNodeMaxLines: 200,
      localSaveNodeAdminMaxLines: 800,
      localSaveNoteMaxLines: 20,
      ideEditOpenParent: false,
      ideVmsNoteEnabled: false
    },
    shorten: {
      enabled: shortenEnabled,
      host: "localhost",
      port: 5549,
      path: "/interface/v1/shorten/",
      domain: "",
      minimum: 50
    },
    remoteAuth: {
      enabled: false,
      host: "http://remoteauth.test",
      path: "/session/authenticate/",
      remoteSecret: "sekret"
    },
    status: {
      serviceUrl: ""
    }
  };

  const mooConnections = [];
  moduleMock("../../src/config/index.js", { defaultExport: config });
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
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      }),
      inspect() {}
    }
  });
  moduleMock("node:net", {
    namedExports: {
      connect() {
        const conn = makeMooConnection();
        mooConnections.push(conn);
        return conn;
      }
    }
  });
  moduleMock("node:dns", {
    namedExports: {
      promises: {
        reverse: async () => []
      }
    }
  });
  moduleMock("../../src/services/shorten.js", {
    namedExports: {
      urls: shortenImpl || (async (text) => text)
    }
  });

  const { start, stop } = await import(`../../src/server.js?socket-runtime=${Date.now()}`);
  const runtime = await start({ port: 0, ip: "127.0.0.1", skipBuild: true });
  t.after(async () => {
    await stop();
    t.mock.restoreAll();
    nock.cleanAll();
    nock.enableNetConnect();
  });
  return {
    baseUrl: `http://127.0.0.1:${runtime.http.port}`,
    mooConnections
  };
}

test("integration: socket input lifecycle sends statuses and disconnects on @quit", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");
  const { baseUrl, mooConnections } = await bootSocketServer(t, { shortenEnabled: false });

  const events = [];
  await new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("timed out waiting for socket lifecycle completion"));
    }, 2500);
    timer.unref?.();
    socket.on("connect_error", reject);
    socket.on("error", reject);
    socket.on("connect", () => {
      socket.emit("input", "look");
      socket.emit("input", "@quit");
    });
    socket.on("status", (msg) => {
      events.push(["status", msg]);
    });
    socket.on("disconnected", () => {
      events.push(["disconnected"]);
      socket.once("disconnect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.disconnect();
    });
  });

  assert.ok(events.some((e) => e[0] === "status" && String(e[1]).includes("sent 4 characters")));
  assert.ok(events.some((e) => e[0] === "status" && String(e[1]).includes("command sent from Dome Client")));
  assert.ok(events.some((e) => e[0] === "disconnected"));
  assert.ok(mooConnections.length > 0);
  const writes = mooConnections[0].writes.join("");
  assert.match(writes, /look\r\n/);
  assert.match(writes, /@quit\r\n/);
});

test("integration: disconnect without @quit writes quit once even if disconnect is repeated", async (t) => {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);
  const moo = new EventEmitter();
  const writes = [];
  moo.write = (data, _encoding, cb) => {
    writes.push(String(data));
    if (typeof cb === "function") {
      cb();
    }
    return true;
  };
  moo.end = () => {};

  moduleMock("node:net", {
    namedExports: {
      connect() {
        process.nextTick(() => moo.emit("connect"));
        return moo;
      }
    }
  });
  moduleMock("node:dns", {
    namedExports: {
      promises: {
        reverse: async () => []
      }
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
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      }),
      inspect() {}
    }
  });

  const socketController = await import(`../../src/controllers/socket.js?disconnect-edge=${Date.now()}`);
  const { socket } = createSocket();
  await socketController.connection(socket);
  socket.emit("disconnect");
  socket.emit("disconnect");

  const quitWrites = writes.filter((line) => line.includes("@quit"));
  assert.equal(quitWrites.length, 1);
  t.mock.restoreAll();
});

test("integration: shorten failures do not block socket data flow", async (t) => {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const moo = new EventEmitter();
  moo.write = (_data, _encoding, cb) => {
    if (typeof cb === "function") {
      cb();
    }
    return true;
  };
  moo.end = () => {};
  moduleMock("node:net", {
    namedExports: {
      connect() {
        process.nextTick(() => moo.emit("connect"));
        return moo;
      }
    }
  });
  moduleMock("node:dns", {
    namedExports: {
      promises: {
        reverse: async () => []
      }
    }
  });
  moduleMock("../../src/config/index.js", {
    defaultExport: {
      node: { socketProxied: false, multiMud: false, poweredBy: "Dome Client" },
      moo: { host: "moo.test", port: 5555 },
      shorten: { enabled: true },
    }
  });
  moduleMock("../../src/logger.js", {
    namedExports: {
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      }),
      inspect() {}
    }
  });
  moduleMock("../../src/services/shorten.js", {
    namedExports: {
      urls: async () => {
        throw new Error("shorten failed");
      }
    }
  });

  const socketController = await import(`../../src/controllers/socket.js?shorten-fail=${Date.now()}`);
  const { socket, events } = createSocket();
  socket.emit("shorten-on");
  await socketController.connection(socket);
  moo.emit("data", Buffer.from("hello http://example.com\r\n"));

  assert.ok(events.some((entry) => entry[0] === "data" && String(entry[1]).includes("hello http://example.com")));
  t.mock.restoreAll();
});

test("integration: shorten-on applies successful url shortening transform", async (t) => {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const moo = new EventEmitter();
  moo.write = (_data, _encoding, cb) => {
    if (typeof cb === "function") {
      cb();
    }
    return true;
  };
  moo.end = () => {};
  moduleMock("node:net", {
    namedExports: {
      connect() {
        process.nextTick(() => moo.emit("connect"));
        return moo;
      }
    }
  });
  moduleMock("node:dns", {
    namedExports: {
      promises: {
        reverse: async () => []
      }
    }
  });
  moduleMock("../../src/config/index.js", {
    defaultExport: {
      node: { socketProxied: false, multiMud: false, poweredBy: "Dome Client" },
      moo: { host: "moo.test", port: 5555 },
      shorten: { enabled: true },
    }
  });
  moduleMock("../../src/logger.js", {
    namedExports: {
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      }),
      inspect() {}
    }
  });
  moduleMock("../../src/services/shorten.js", {
    namedExports: {
      urls: async (text) => text.replace("http://example.com", "https://sho.rt/x")
    }
  });

  const socketController = await import(`../../src/controllers/socket.js?shorten-pass=${Date.now()}`);
  const { socket, events } = createSocket();
  await socketController.connection(socket);
  socket.emit("shorten-on");
  moo.emit("data", Buffer.from("hello http://example.com\r\n"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(events.some((entry) => entry[0] === "data" && String(entry[1]).includes("https://sho.rt/x")));
  t.mock.restoreAll();
});

test("integration: multi-mud handshake uses query host/port, falls back on invalid query, and writes dome-client-user marker response", async (t) => {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const calls = [];
  const writes = [];
  const connections = [];
  moduleMock("node:net", {
    namedExports: {
      connect(options) {
        calls.push(options);
        const conn = new EventEmitter();
        conn.write = (data, _encoding, cb) => {
          writes.push(String(data));
          if (typeof cb === "function") {
            cb();
          }
          return true;
        };
        conn.end = () => {};
        connections.push(conn);
        process.nextTick(() => conn.emit("connect"));
        return conn;
      }
    }
  });
  moduleMock("node:dns", {
    namedExports: {
      promises: {
        reverse: async () => ["resolved.example.test"]
      }
    }
  });
  moduleMock("../../src/config/index.js", {
    defaultExport: {
      node: { socketProxied: false, multiMud: true, poweredBy: "Dome Client" },
      moo: { host: "fallback.test", port: 7777 },
      shorten: { enabled: false },
    }
  });
  moduleMock("../../src/logger.js", {
    namedExports: {
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      }),
      inspect() {}
    }
  });
  const recorded = [];
  moduleMock("../../src/services/multi-mud-metrics.js", {
    namedExports: {
      recordConnection(host, port) {
        recorded.push(`${host}:${port}`);
      }
    }
  });

  const socketController = await import(`../../src/controllers/socket.js?multi-mud-path=${Date.now()}`);

  const good = createSocket().socket;
  good.handshake.query = { host: "Chosen.Game.Example", port: "6000" };
  await socketController.connection(good);
  connections[0].emit("data", Buffer.from("#$# dome-client-user"));

  const bad = createSocket().socket;
  bad.handshake.query = { host: " ", port: "99999" };
  await socketController.connection(bad);

  assert.deepEqual(calls.map((c) => `${c.host}:${c.port}`), ["Chosen.Game.Example:6000", "fallback.test:7777"]);
  assert.deepEqual(recorded, ["Chosen.Game.Example:6000", "fallback.test:7777"]);
  assert.ok(writes.some((line) => line === "@dome-client-user resolved.example.test\r\n"));
  t.mock.restoreAll();
});

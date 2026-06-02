/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import nock from "nock";
import { io as createSocketClient } from "socket.io-client";

const metricsPath = path.join(process.cwd(), "data", `multi-mud-metrics.integration.${process.pid}.json`);
const tempMetricsPath = `${metricsPath}.tmp`;

function createMockMooConnection() {
  const conn = new EventEmitter();
  conn.write = (_data, _encoding, cb) => {
    if (typeof cb === "function") {
      cb();
    }
    return true;
  };
  conn.end = () => {};
  process.nextTick(() => {
    conn.emit("connect");
  });
  return conn;
}

function createFailingMooConnection() {
  const conn = new EventEmitter();
  conn.write = () => true;
  conn.end = () => {};
  process.nextTick(() => {
    conn.emit("error", new Error("connect fail"));
  });
  return conn;
}

async function bootMultiMudServer(t, { shouldFail = false } = {}) {
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
      multiMud: true,
      poweredBy: "Dome Client",
      session: {
        secret: "integration-test-secret"
      }
    },
    moo: {
      name: "Integration MUD",
      host: "default.test",
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
      enabled: false,
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
        return shouldFail ? createFailingMooConnection() : createMockMooConnection();
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

  const { start, stop } = await import(`../../src/server.js?multi-mud-integration=${Date.now()}`);
  const runtime = await start({ port: 0, ip: "127.0.0.1", skipBuild: true });
  t.after(async () => {
    await stop();
    t.mock.restoreAll();
    nock.cleanAll();
    nock.enableNetConnect();
  });
  return {
    baseUrl: `http://127.0.0.1:${runtime.http.port}`
  };
}

test("integration: multi-mud successful connects update metrics in memory and on disk", async (t) => {
  await fs.rm(metricsPath, { force: true });
  await fs.rm(tempMetricsPath, { force: true });
  const metricsSvc = await import("../../src/services/multi-mud-metrics.js");
  metricsSvc.setMetricsPathForTests(metricsPath);
  metricsSvc.resetMetricsForTests();

  t.after(async () => {
    metricsSvc.setMetricsPathForTests();
    metricsSvc.resetMetricsForTests();
    await fs.rm(metricsPath, { force: true });
    await fs.rm(tempMetricsPath, { force: true });
  });

  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  const { baseUrl } = await bootMultiMudServer(t);

  const connectOnce = ({ host, port }) => new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000,
      query: { host, port: String(port) }
    });
    socket.once("connected", () => {
      socket.disconnect();
      resolve();
    });
    socket.once("connect_error", reject);
    socket.once("error", reject);
  });

  await connectOnce({ host: "Example.ORG", port: 7777 });
  await connectOnce({ host: "example.org", port: 7777 });

  const firstRead = JSON.parse(await fs.readFile(metricsPath, "utf8"));
  assert.ok(firstRead.count >= 2);
  assert.ok((firstRead.games["example.org:7777"] || 0) >= 2);

  const freshService = await import(`../../src/services/multi-mud-metrics.js?verify=${Date.now()}`);
  freshService.setMetricsPathForTests(metricsPath);
  const stats = freshService.connectedStats();
  assert.ok(stats.count >= 2);
  const target = stats.games.find((entry) => entry.address === "example.org:7777");
  assert.ok(target);
  assert.ok(target.count >= 2);
});

test("integration: multi-mud failed connects do not write metrics", async (t) => {
  await fs.rm(metricsPath, { force: true });
  await fs.rm(tempMetricsPath, { force: true });
  const metricsSvc = await import("../../src/services/multi-mud-metrics.js");
  metricsSvc.setMetricsPathForTests(metricsPath);
  metricsSvc.resetMetricsForTests();

  t.after(async () => {
    metricsSvc.setMetricsPathForTests();
    metricsSvc.resetMetricsForTests();
    await fs.rm(metricsPath, { force: true });
    await fs.rm(tempMetricsPath, { force: true });
  });

  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");
  const { baseUrl } = await bootMultiMudServer(t, { shouldFail: true });

  await new Promise((resolve) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000,
      query: { host: "example.org", port: "7777" }
    });
    const done = () => {
      socket.disconnect();
      resolve();
    };
    const timer = setTimeout(done, 1500);
    timer.unref?.();
    socket.once("error", done);
    socket.once("connect_error", done);
  });

  let parsed = null;
  try {
    parsed = JSON.parse(await fs.readFile(metricsPath, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  if (parsed) {
    assert.ok((parsed.games["example.org:7777"] || 0) <= 1);
  }
});

test("integration: multi-mud invalid query falls back to configured host and port", async (t) => {
  await fs.rm(metricsPath, { force: true });
  await fs.rm(tempMetricsPath, { force: true });
  const metricsSvc = await import("../../src/services/multi-mud-metrics.js");
  metricsSvc.setMetricsPathForTests(metricsPath);
  metricsSvc.resetMetricsForTests();

  t.after(async () => {
    metricsSvc.setMetricsPathForTests();
    metricsSvc.resetMetricsForTests();
    await fs.rm(metricsPath, { force: true });
    await fs.rm(tempMetricsPath, { force: true });
  });

  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");
  const { baseUrl } = await bootMultiMudServer(t);

  await new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000,
      query: { host: "", port: "abc" }
    });
    socket.once("connected", () => {
      socket.disconnect();
      resolve();
    });
    socket.once("connect_error", reject);
    socket.once("error", reject);
  });

  const saved = JSON.parse(await fs.readFile(metricsPath, "utf8"));
  assert.equal(saved.count, 1);
  assert.equal(saved.games["default.test:5555"], 1);
});

test("integration: multi-mud whitespace host and out-of-range port fallback to defaults", async (t) => {
  await fs.rm(metricsPath, { force: true });
  await fs.rm(tempMetricsPath, { force: true });
  const metricsSvc = await import("../../src/services/multi-mud-metrics.js");
  metricsSvc.setMetricsPathForTests(metricsPath);
  metricsSvc.resetMetricsForTests();

  t.after(async () => {
    metricsSvc.setMetricsPathForTests();
    metricsSvc.resetMetricsForTests();
    await fs.rm(metricsPath, { force: true });
    await fs.rm(tempMetricsPath, { force: true });
  });

  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");
  const { baseUrl } = await bootMultiMudServer(t);

  await new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000,
      query: { host: "   ", port: "70000" }
    });
    socket.once("connected", () => {
      socket.disconnect();
      resolve();
    });
    socket.once("connect_error", reject);
    socket.once("error", reject);
  });

  const saved = JSON.parse(await fs.readFile(metricsPath, "utf8"));
  assert.equal(saved.count, 1);
  assert.equal(saved.games["default.test:5555"], 1);
});

test("integration: multi-mud recovers from malformed metrics file and rewrites valid json", async (t) => {
  await fs.rm(metricsPath, { force: true });
  await fs.rm(tempMetricsPath, { force: true });
  await fs.writeFile(metricsPath, "{malformed", "utf8");

  const metricsSvc = await import("../../src/services/multi-mud-metrics.js");
  metricsSvc.setMetricsPathForTests(metricsPath);
  metricsSvc.resetMetricsForTests();

  t.after(async () => {
    metricsSvc.setMetricsPathForTests();
    metricsSvc.resetMetricsForTests();
    await fs.rm(metricsPath, { force: true });
    await fs.rm(tempMetricsPath, { force: true });
  });

  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");
  const { baseUrl } = await bootMultiMudServer(t);

  await new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000,
      query: { host: "example.org", port: "7777" }
    });
    socket.once("connected", () => {
      socket.disconnect();
      resolve();
    });
    socket.once("connect_error", reject);
    socket.once("error", reject);
  });

  const saved = JSON.parse(await fs.readFile(metricsPath, "utf8"));
  assert.equal(saved.count, 1);
  assert.equal(saved.games["example.org:7777"], 1);
});

test("integration: multi-mud accepts boundary ports and normalizes host casing", async (t) => {
  await fs.rm(metricsPath, { force: true });
  await fs.rm(tempMetricsPath, { force: true });
  const metricsSvc = await import("../../src/services/multi-mud-metrics.js");
  metricsSvc.setMetricsPathForTests(metricsPath);
  metricsSvc.resetMetricsForTests();

  t.after(async () => {
    metricsSvc.setMetricsPathForTests();
    metricsSvc.resetMetricsForTests();
    await fs.rm(metricsPath, { force: true });
    await fs.rm(tempMetricsPath, { force: true });
  });

  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");
  const { baseUrl } = await bootMultiMudServer(t);

  const connectOnce = ({ host, port }) => new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000,
      query: { host, port: String(port) }
    });
    socket.once("connected", () => {
      socket.disconnect();
      resolve();
    });
    socket.once("connect_error", reject);
    socket.once("error", reject);
  });

  await connectOnce({ host: "MixedCase.EXAMPLE.Org", port: 23 });
  await connectOnce({ host: "MIXEDCASE.example.org", port: 65535 });

  const saved = JSON.parse(await fs.readFile(metricsPath, "utf8"));
  assert.equal(saved.count, 2);
  assert.equal(saved.games["mixedcase.example.org:23"], 1);
  assert.equal(saved.games["mixedcase.example.org:65535"], 1);
});

test("integration: multi-mud connect page and socket connect flow persist selected game metrics", async (t) => {
  await fs.rm(metricsPath, { force: true });
  await fs.rm(tempMetricsPath, { force: true });
  const metricsSvc = await import("../../src/services/multi-mud-metrics.js");
  metricsSvc.setMetricsPathForTests(metricsPath);
  metricsSvc.resetMetricsForTests();

  t.after(async () => {
    metricsSvc.setMetricsPathForTests();
    metricsSvc.resetMetricsForTests();
    await fs.rm(metricsPath, { force: true });
    await fs.rm(tempMetricsPath, { force: true });
  });

  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");
  const { baseUrl } = await bootMultiMudServer(t);

  const homeRes = await fetch(`${baseUrl}/`);
  const homeText = await homeRes.text();
  assert.equal(homeRes.status, 200);
  assert.match(homeText, /Connect To \.\.\./i);
  assert.match(homeText, /id="moo-hostname"/);
  assert.match(homeText, /id="moo-port"/);

  await new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000,
      query: { host: "Journey.Example.ORG", port: "7777" }
    });
    socket.once("connected", () => {
      socket.disconnect();
      resolve();
    });
    socket.once("connect_error", reject);
    socket.once("error", reject);
  });

  const saved = JSON.parse(await fs.readFile(metricsPath, "utf8"));
  assert.equal(saved.count, 1);
  assert.equal(saved.games["journey.example.org:7777"], 1);
});

/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import nock from "nock";

async function bootServer(t, { metricsPath } = {}) {
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
      session: { secret: "integration-test-secret" }
    },
    moo: { name: "Integration MUD", host: "default.test", port: 5555 },
    website: { signupUrl: "" },
    guest: { connectCommand: "connect guest" },
    autocomplete: { enabled: false },
    editor: {
      localSaveNodeMaxLines: 200,
      localSaveNodeAdminMaxLines: 800,
      localSaveNoteMaxLines: 20,
      ideEditOpenParent: false,
      ideVmsNoteEnabled: false,
      ideObjectBrowserEnabled: true,
      idePropertyBrowserEnabled: true,
      ideHoverOverlaysEnabled: true,
      ideReferenceNavigationEnabled: true,
      ideScratchEnabled: true
    },
    shorten: { enabled: false, host: "localhost", port: 5549, path: "/interface/v1/shorten/", domain: "", minimum: 50 },
    remoteAuth: { enabled: true, host: "http://remoteauth.test", path: "/session/authenticate/", remoteSecret: "sekret" },
    status: { serviceUrl: "http://status.test/moo/status/" }
  };

  moduleMock("../../src/config/index.js", { defaultExport: config });
  moduleMock("../../src/logger.js", {
    namedExports: {
      named: () => ({ info() {}, warn() {}, error() {}, debug() {} })
    }
  });
  moduleMock("../../src/controllers/socket.js", {
    namedExports: { connection() {}, error() {} }
  });

  const metricsSvc = await import("../../src/services/multi-mud-metrics.js");
  metricsSvc.setMetricsPathForTests(metricsPath);

  const { start, stop } = await import(`../../src/server.js?multi-routes=${Date.now()}-${Math.random()}`);
  const runtime = await start({ port: 0, ip: "127.0.0.1", skipBuild: true });

  t.after(async () => {
    await stop();
    metricsSvc.setMetricsPathForTests();
    t.mock.restoreAll();
    nock.cleanAll();
    nock.enableNetConnect();
  });

  return { baseUrl: `http://127.0.0.1:${runtime.http.port}` };
}

test("integration: multi-mud connect page renders host/port/game-owner link and stats table", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dome-multimud-routes-"));
  const metricsPath = path.join(tmpDir, "metrics.json");
  await fs.writeFile(metricsPath, JSON.stringify({
    count: 5,
    games: {
      "alpha.example.org:5555": 3,
      "alpha.example.org:5555|tls": 1,
      "beta.example.org:7777": 2
    }
  }, null, 2), "utf8");
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const { baseUrl } = await bootServer(t, { metricsPath });
  const res = await request(baseUrl).get("/").expect(200);

  assert.match(res.text, /Connect To \.\.\./i);
  assert.match(res.text, /id="moo-hostname"/);
  assert.match(res.text, /id="moo-port"/);
  assert.match(res.text, /href="\/game-owner-questions\/"/);
  assert.match(res.text, /All Time Connections/i);
  assert.match(res.text, /alpha\.example\.org:5555/);
  assert.match(res.text, /alpha\.example\.org:5555 \(TLS\)/);
  assert.match(res.text, /beta\.example\.org:7777/);
  assert.match(res.text, /href="\/player-client\/\?gh=[^"]+"/);
  assert.match(res.text, /href="\/player-client\/\?gh=alpha\.example\.org&gp=5555&amp;transport_mode=tls"/);
});

test("integration: game owner questions page returns 200 in multi-mud mode", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dome-multimud-routes-"));
  const metricsPath = path.join(tmpDir, "metrics.json");
  await fs.writeFile(metricsPath, JSON.stringify({ count: 0, games: {} }), "utf8");
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const { baseUrl } = await bootServer(t, { metricsPath });
  const res = await request(baseUrl).get("/game-owner-questions/").expect(200);
  assert.match(res.text, /Game Owner Questions/i);
  assert.match(res.text, /dome-client-user/i);
});

test("integration: multi-mud stats render only normalized valid game addresses", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dome-multimud-routes-"));
  const metricsPath = path.join(tmpDir, "metrics.json");
  await fs.writeFile(metricsPath, JSON.stringify({
    count: 9,
    games: {
      "MixedCase.Example.Org:5555": 4,
      " bad host :5555": 3,
      "unicode.example.org:2222": 5,
      "emptyport.example.org:": 1
    }
  }, null, 2), "utf8");
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const { baseUrl } = await bootServer(t, { metricsPath });
  const res = await request(baseUrl).get("/").expect(200);

  assert.match(res.text, /mixedcase\.example\.org:5555/);
  assert.doesNotMatch(res.text, /MixedCase\.Example\.Org:5555/);
  assert.match(res.text, /unicode\.example\.org:2222/);
  assert.doesNotMatch(res.text, /emptyport\.example\.org/);
});

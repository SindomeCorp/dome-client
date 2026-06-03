/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import nock from "nock";

async function bootServer(t, { playerPath, brokenPath }) {
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
      session: { secret: "integration-test-secret" }
    },
    moo: { name: "Integration MUD", host: "127.0.0.1", port: 4444 },
    website: { signupUrl: "" },
    guest: { connectCommand: "connect guest" },
    autocomplete: {
      enabled: true,
      p: playerPath,
      z: brokenPath
    },
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

  const { start, stop } = await import(`../../src/server.js?ac-int=${Date.now()}-${Math.random()}`);
  const runtime = await start({ port: 0, ip: "127.0.0.1", skipBuild: true });

  t.after(async () => {
    await stop();
    t.mock.restoreAll();
    nock.cleanAll();
    nock.enableNetConnect();
  });

  return { baseUrl: `http://127.0.0.1:${runtime.http.port}` };
}

test("integration: autocomplete enabled returns commands, unknown type empty, and broken file 500", async (t) => {
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

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dome-ac-"));
  const playerPath = path.join(tmpDir, "player.txt");
  await fs.writeFile(playerPath, "look\nsay\n", "utf8");
  const brokenPath = path.join(tmpDir, "missing-file.txt");
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const { baseUrl } = await bootServer(t, { playerPath, brokenPath });
  const http = request(baseUrl);

  const known = await http.get("/ac/p").expect(200);
  assert.match(known.headers["content-type"] || "", /application\/json/);
  assert.deepEqual(known.body.slice(0, 2), ["look", "say"]);

  const unknown = await http.get("/ac/unknown").expect(200);
  assert.deepEqual(unknown.body, []);

  const broken = await http.get("/ac/z").expect(500);
  assert.deepEqual(broken.body, { error: "Failed to load autocomplete data" });
});

test("integration: autocomplete caches loaded command files during server lifetime", async (t) => {
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

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dome-ac-cache-"));
  const playerPath = path.join(tmpDir, "player.txt");
  await fs.writeFile(playerPath, "look\nsay\n", "utf8");
  const brokenPath = path.join(tmpDir, "missing-file.txt");
  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const { baseUrl } = await bootServer(t, { playerPath, brokenPath });
  const http = request(baseUrl);

  const first = await http.get("/ac/p").expect(200);
  assert.deepEqual(first.body.slice(0, 2), ["look", "say"]);

  await fs.writeFile(playerPath, "pose\nwhisper\n", "utf8");
  const second = await http.get("/ac/p").expect(200);
  assert.deepEqual(second.body.slice(0, 2), ["look", "say"]);
});

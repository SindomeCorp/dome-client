/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import nock from "nock";

async function bootServer(t) {
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
    autocomplete: { enabled: false },
    editor: {
      localSaveNodeMaxLines: 200,
      localSaveNodeAdminMaxLines: 800,
      localSaveNoteMaxLines: 20,
      ideEditOpenParent: false,
      ideVmsNoteEnabled: false
    },
    shorten: { enabled: false, host: "localhost", port: 5549, path: "/interface/v1/shorten/", domain: "", minimum: 50 },
    remoteAuth: { enabled: true, host: "http://remoteauth.test", path: "/session/authenticate/", remoteSecret: "sekret" },
    status: { serviceUrl: "" }
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

  const { start, stop } = await import(`../../src/server.js?pcs-int=${Date.now()}-${Math.random()}`);
  const runtime = await start({ port: 0, ip: "127.0.0.1", skipBuild: true });

  t.after(async () => {
    await stop();
    t.mock.restoreAll();
    nock.cleanAll();
    nock.enableNetConnect();
  });

  return { baseUrl: `http://127.0.0.1:${runtime.http.port}` };
}

test("integration: player-client omits status health UI when status service is blank", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  const { baseUrl } = await bootServer(t);
  const res = await request(baseUrl).get("/player-client/").expect(200);

  assert.match(res.text, /id="lineBuffer"/);
  assert.doesNotMatch(res.text, /id="gameHealth"/);
  assert.doesNotMatch(res.text, /id="gameHealthDetail"/);
});

test("integration: status endpoint returns stable disabled payload when status service is blank", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  const { baseUrl } = await bootServer(t);
  const res = await request(baseUrl).get("/moo/status/").expect(200);
  const payload = res.body && Object.keys(res.body).length ? res.body : JSON.parse(res.text || "{}");

  assert.equal(typeof payload.message, "string");
  assert.equal(payload.message, "status service disabled");
  assert.equal(typeof payload.cpu, "number");
  assert.equal(typeof payload.memory, "number");
  assert.equal(typeof payload.checked, "number");
  assert.equal(typeof payload.users, "number");
  assert.equal(typeof payload.interval, "number");
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, "state") || typeof payload.state === "string");
});

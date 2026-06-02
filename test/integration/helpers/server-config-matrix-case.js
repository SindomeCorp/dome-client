/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import assert from "node:assert/strict";
import request from "supertest";
import nock from "nock";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeoutMs = 2500, intervalMs = 100 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await assertion();
      return;
    } catch {
      await wait(intervalMs);
    }
  }
  await assertion();
}

async function bootServer(t, {
  remoteAuthEnabled,
  multiMud,
  statusServiceUrl
}) {
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
      multiMud,
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
    remoteAuth: { enabled: remoteAuthEnabled, host: "http://remoteauth.test", path: "/session/authenticate/", remoteSecret: "sekret" },
    status: { serviceUrl: statusServiceUrl }
  };

  moduleMock("../../../src/config/index.js", { defaultExport: config });
  moduleMock("../../../src/logger.js", {
    namedExports: {
      named: () => ({ info() {}, warn() {}, error() {}, debug() {} })
    }
  });
  moduleMock("../../../src/controllers/socket.js", {
    namedExports: { connection() {}, error() {} }
  });

  const { start, stop } = await import(`../../../src/server.js?matrix-case=${Date.now()}-${Math.random()}`);
  const runtime = await start({ port: 0, ip: "127.0.0.1", skipBuild: true });

  t.after(async () => {
    await stop();
    t.mock.restoreAll();
    nock.cleanAll();
    nock.enableNetConnect();
  });

  return `http://127.0.0.1:${runtime.http.port}`;
}

export async function runMatrixCase(t, matrixCase) {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  if (matrixCase.statusServiceUrl) {
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
  }

  const baseUrl = await bootServer(t, matrixCase);
  const home = await request(baseUrl).get("/").expect(200);

  if (matrixCase.expect.homeHas) {
    assert.match(home.text, matrixCase.expect.homeHas);
  }
  if (matrixCase.expect.homeHasSecondary) {
    assert.match(home.text, matrixCase.expect.homeHasSecondary);
  }
  if (matrixCase.expect.homeMissing) {
    assert.doesNotMatch(home.text, matrixCase.expect.homeMissing);
  }

  await request(baseUrl).get("/game-owner-questions/").expect(matrixCase.expect.gameOwnerStatus);

  await waitFor(async () => {
    const statusRes = await request(baseUrl).get("/moo/status/").expect(200);
    const payload = statusRes.body && Object.keys(statusRes.body).length ? statusRes.body : JSON.parse(statusRes.text || "{}");
    assert.equal(payload.message, matrixCase.expect.statusMessage);
    if (matrixCase.expect.statusState) {
      assert.equal(payload.state, matrixCase.expect.statusState);
    }
  });
}

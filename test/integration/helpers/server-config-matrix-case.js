/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import assert from "node:assert/strict";
import request from "supertest";
import nock from "nock";
import { bootServer as bootIntegrationServer } from "./boot-server.js";

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

  const { baseUrl } = await bootIntegrationServer(t, {
    node: { multiMud: matrixCase.multiMud },
    remoteAuth: { enabled: matrixCase.remoteAuthEnabled },
    status: { serviceUrl: matrixCase.statusServiceUrl }
  });
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

/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import nock from "nock";

test("integration: status host-only service URL normalizes to https + /moo/status/ and polls successfully", async (t) => {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  moduleMock("../../src/config/index.js", { defaultExport: {
    status: { serviceUrl: "status.example.com" }
  } });
  moduleMock("../../src/logger.js", {
    namedExports: {
      named: () => ({ info() {}, warn() {}, error() {}, debug() {} })
    }
  });

  nock.disableNetConnect();
  nock("https://status.example.com")
    .get("/moo/status/")
    .reply(200, {
      message: "normalized host-only url",
      cpu: 5,
      memory: 9,
      checked: Date.now(),
      users: 2,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const status = await import(`../../src/controllers/status.js?normalize-host=${Date.now()}`);
  const refreshed = await status.refreshStatus();
  assert.equal(refreshed.state, "OK");
  assert.equal(refreshed.message, "normalized host-only url");

  t.mock.restoreAll();
  nock.cleanAll();
  nock.enableNetConnect();
});

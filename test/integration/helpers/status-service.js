import nock from "nock";

export function mockStatusOk(overrides = {}) {
  return nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK",
      ...overrides
    }, { "Content-Type": "application/json" });
}

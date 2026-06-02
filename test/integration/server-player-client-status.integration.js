/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import nock from "nock";
import { bootServer } from "./helpers/boot-server.js";

test("integration: player-client omits status health UI when status service is blank", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  const { baseUrl } = await bootServer(t, {
    status: { serviceUrl: "" }
  });
  const res = await request(baseUrl).get("/player-client/").expect(200);

  assert.match(res.text, /id="lineBuffer"/);
  assert.doesNotMatch(res.text, /id="gameHealth"/);
  assert.doesNotMatch(res.text, /id="gameHealthDetail"/);
});

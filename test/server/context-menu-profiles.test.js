import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createApp } from "../../src/server/app.js";

test("the real client application serves separate role JSON files, not a directory index or arbitrary paths", async () => {
  const app = createApp({
    config: {
      node: { session: { secret: "local-profile-test" }, mode: "dev", socketProxied: false },
      moo: { name: "Local fixture" }, guest: { connectCommand: "" }, shorten: { enabled: false }
    },
    logger: { info() {}, error() {} },
    router: express.Router(),
    deviceCapture: () => (_req, _res, next) => next(),
    getLogExportCss: () => "",
    versionHash: "fixture", appVersion: "fixture"
  });
  for (const id of ["player", "gm", "programmer"]) {
    const response = await request(app).get("/profiles/" + id + ".json").expect(200).expect("Content-Type", /json/);
    assert.equal(response.body.version, 1);
    assert.equal(response.body.profiles.length, 1);
    assert.equal(response.body.profiles[0].id, id);
  }
  for (const path of ["/profiles/", "/profiles/missing.json", "/profiles/gm_user.json", "/profiles/..%2F..%2F.env"]) await request(app).get(path).expect(404);
});

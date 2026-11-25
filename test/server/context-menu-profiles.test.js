import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createApp } from "../../src/server/app.js";

test("real client and standalone Options receive the effective startup feature flag", async (t) => {
  for (const mode of ["enabled", "env-off", "missing", "invalid"]) await t.test(mode, async () => {
    const errors = [];
    const router = express.Router();
    router.get("/fixture/client", (_req, res) => res.render("client", { meta: { title: "Fixture", description: "", keywords: "" }, showReporter: () => false }));
    router.get("/fixture/options", (_req, res) => res.render("partials/client-options-overlay", { meta: { title: "Options", description: "", keywords: "" } }));
    const app = createApp({
      config: {
        contextMenus: { enabled: mode !== "env-off" },
        node: { session: { secret: "fixture" }, mode: "dev", socketProxied: false },
        moo: { name: "Local fixture" }, guest: { connectCommand: "" }, shorten: { enabled: false }
      },
      logger: { info() {}, warn() {}, error: (text) => errors.push(text) }, router,
      contextProfileReadFile: ["missing", "invalid"].includes(mode) ? () => {
        if (mode === "missing") throw new Error("ENOENT synthetic missing");
        return "{}";
      } : undefined,
      deviceCapture: () => (_req, _res, next) => next(), getLogExportCss: () => "", versionHash: "fixture", appVersion: "fixture"
    });
    for (const path of ["/fixture/client", "/fixture/options"]) {
      const { text } = await request(app).get(path).expect(200);
      assert.ok(text.includes("window.__CONTEXT_MENUS__ = {\"enabled\":" + (mode === "enabled") + "}"));
      assert.equal(text.includes("id=\"client-options-tab-context\""), mode === "enabled");
      assert.equal(text.includes("id=\"context-menu-json\""), mode === "enabled");
    }
    assert.equal(errors.length, ["missing", "invalid"].includes(mode) ? 1 : 0);
  });
});

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

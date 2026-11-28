import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import express from "express";
import request from "supertest";
import config from "../../src/config/index.js";
import { createApp } from "../../src/server/app.js";

function fixture(t, overrides = {}, { ipBlocklist, appExpress = express, addRoutes } = {}) {
  const router = express.Router();
  const logger = { info: t.mock.fn(), warn: t.mock.fn(), error: t.mock.fn() };
  const start = new Date("2025-01-02T03:04:05Z");
  router.all("/fixture", (req, res) => {
    res.json({
      body: req.body,
      cookies: req.cookies,
      device: req.device,
      debugMode: res.locals.debugMode,
      decached: res.locals.decache("/fixture.css"),
      version: res.locals.version,
      isMultiMud: res.locals.isMultiMud,
      contextMenus: res.locals.contextMenus,
      outputEnabled: res.locals.outputWindows.enabled,
      customRegexEnabled: res.locals.outputWindows.customRegexEnabled,
      firstPreset: res.locals.outputWindows.presets[0]?.id,
      showReporter: res.locals.showReporter(req)
    });
  });
  router.get(["/health", "/health/", "/moo/status", "/moo/status/"], (_req, res) => res.json({ ok: true }));

  addRoutes?.(router);

  const configured = {
    ...config,
    contextMenus: { enabled: false },
    ...overrides,
    node: { ...config.node, socketProxied: false, ...overrides.node }
  };
  const app = createApp({
    config: configured, express: appExpress, router, logger, appStartTime: start, ipBlocklist,
    versionHash: "test-build", appVersion: "1.2.3", getLogExportCss: () => ""
  });
  return { app, logger, start };
}

test("real app wiring supplies request and rendering locals in production", async (t) => {
  const { app, logger, start } = fixture(t, {
    node: { mode: "production", multiMud: true, healthEndpointEnabled: true },
    outputWindows: { enabled: false, customRegexEnabled: false, presetsPath: "data/sindome-output-window-presets.json" }
  });
  assert.equal(app.get("appStartTime"), start);
  assert.equal(path.basename(app.get("views")), "views");

  const response = await request(app).post("/fixture")
    .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1")
    .set("Cookie", "example=local")
    .type("form")
    .send("form%5Bitem%5D=value")
    .timeout({ response: 2000 })
    .expect(200);

  assert.deepEqual(response.body, {
    body: { "form[item]": "value" },
    cookies: { example: "local" },
    device: "phone",
    debugMode: false,
    decached: "/fixture.css?test-build",
    version: "1.2.3",
    isMultiMud: true,
    contextMenus: { enabled: false },
    outputEnabled: false,
    customRegexEnabled: false,
    firstPreset: "game-help",
    showReporter: true
  });
  assert.match(response.headers["set-cookie"][0], /^connect\.sid=/);
  const requestLog = stripVTControlCharacters(logger.info.mock.calls[0].arguments[0]);
  assert.match(requestLog, /^POST \/fixture 200 [0-9.]+ ms/);
});

test("feature defaults, health policy and static assets apply through actual requests", async (t) => {
  const { app, logger } = fixture(t, {
    contextMenus: undefined,
    node: { mode: "dev", multiMud: false, healthEndpointEnabled: false },
    outputWindows: undefined
  });
  const http = request(app);
  for (const path of ["/health", "/health/"]) {
    await http.get(path).timeout({ response: 2000 }).expect(404, "Not Found");
  }
  logger.info.mock.resetCalls();
  for (const path of ["/moo/status", "/moo/status/"]) await http.get(path).expect(200, { ok: true });
  assert.equal(logger.info.mock.callCount(), 0);

  const { body } = await http.get("/fixture").set("User-Agent", "MSAppHost/fixture").expect(200);
  assert.equal(body.showReporter, false);
  assert.equal(body.debugMode, true);
  assert.equal(body.isMultiMud, false);
  assert.equal(body.outputEnabled, true);
  assert.equal(body.customRegexEnabled, true);
  assert.deepEqual(body.contextMenus, { enabled: true });

  const profile = await http.get("/profiles/player.json").expect(200);
  assert.equal(profile.body.profiles[0].id, "player");
  await http.get("/profiles/").expect(404);
  await http.get("/css/client.css").expect(200).expect("Content-Type", /text\/css/);
  await http.get("/CSS/client.css").expect(200).expect("Content-Type", /text\/css/);
  await http.get("/js/player-client.js").expect(200).expect("Content-Type", /javascript/);

  const healthy = fixture(t, { node: { healthEndpointEnabled: true } });
  for (const path of ["/health", "/health/"]) await request(healthy.app).get(path).expect(200, { ok: true });
  assert.equal(healthy.logger.info.mock.callCount(), 0);
});

test("app wiring accepts client-sized log forms and applies its configured blocklist", async (t) => {
  const { app } = fixture(t);
  const buffer = "x".repeat(128 * 1024);
  const response = await request(app).post("/fixture").type("form").send({ buffer }).expect(200);
  assert.equal(response.body.body.buffer, buffer);

  const blocked = fixture(t, {}, { ipBlocklist: new Set(["127.0.0.1"]) });
  await request(blocked.app).get("/fixture").expect(403, "Forbidden");
  assert.match(blocked.logger.warn.mock.calls[0].arguments[0], /Blocked request from 127\.0\.0\.1/);
});

test("the app renders its own templates when launched from a different directory", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dome-app-cwd-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const original = process.cwd();
  let app;
  try {
    process.chdir(directory);
    ({ app } = fixture(t, {}, {
      addRoutes(router) {
        router.get("/fixture/render", (_req, res) => res.render("game-owner-questions", {
          meta: { title: "Game Owner Questions" }
        }));
      }
    }));
  } finally {
    process.chdir(original);
  }

  const response = await request(app).get("/fixture/render").expect(200);
  assert.match(response.text, /<h1>Game Owner Questions<\/h1>/);
});

test("the profiles mount serves files by name and disables directory indexes", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dome-app-profiles-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, "index.html"), "fixture index");
  await fs.writeFile(path.join(directory, "example.json"), JSON.stringify({ profiles: [] }));
  const appExpress = Object.assign(() => express(), express, {
    static(root, options) {
      return express.static(path.basename(root) === "profiles" ? directory : root, options);
    }
  });

  const { app } = fixture(t, {}, { appExpress });
  const http = request(app);
  await http.get("/profiles/example.json").expect(200, { profiles: [] });
  await http.get("/profiles/").expect(404);
});

test("a read-only request preserves a concurrent session update", async (t) => {
  const readStarted = Promise.withResolvers();
  const finishRead = Promise.withResolvers();
  const { app } = fixture(t, {}, {
    addRoutes(router) {
      router.post("/fixture/session/:value", (req, res) => {
        req.session.value = req.params.value;
        res.sendStatus(204);
      });
      router.get("/fixture/session", (req, res) => res.json({ value: req.session.value }));
      router.get("/fixture/session/slow", async (req, res) => {
        readStarted.resolve();
        await finishRead.promise;
        res.json({ value: req.session.value });
      });
    }
  });
  const agent = request.agent(app);
  await agent.post("/fixture/session/initial").expect(204);
  const slowRead = agent.get("/fixture/session/slow")
    .timeout(3000)
    .expect(200, { value: "initial" })
    .then(response => response);
  try {
    await Promise.race([readStarted.promise, slowRead]);
    await agent.post("/fixture/session/updated").expect(204);
  } finally {
    finishRead.resolve();
    await slowRead;
  }
  await agent.get("/fixture/session").expect(200, { value: "updated" });
});

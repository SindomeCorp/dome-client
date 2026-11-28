/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import nock from "nock";
import { bootServer } from "./helpers/boot-server.js";

test("integration: acme challenge route serves token file from configured webroot", async (t) => {
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

  const webroot = await fs.mkdtemp(path.join(os.tmpdir(), "dome-acme-"));
  const challengeDir = path.join(webroot, ".well-known", "acme-challenge");
  await fs.mkdir(challengeDir, { recursive: true });
  await fs.writeFile(path.join(challengeDir, "token-abc"), "token-value-abc\n", "utf8");
  await fs.writeFile(path.join(challengeDir, "index.html"), "fixture index", "utf8");
  t.after(async () => {
    await fs.rm(webroot, { recursive: true, force: true });
  });

  const { baseUrl } = await bootServer(t, { acmeWebroot: webroot });

  const found = await request(baseUrl)
    .get("/.well-known/acme-challenge/token-abc")
    .expect(200);
  const tokenBody = typeof found.text === "string" ? found.text : Buffer.from(found.body || "").toString("utf8");
  assert.equal(tokenBody.trim(), "token-value-abc");
  assert.equal(found.headers.etag, undefined);
  await request(baseUrl).get("/.well-known/acme-challenge/").expect(404);

  await request(baseUrl)
    .get("/.well-known/acme-challenge/not-there")
    .expect(404);
});

test("integration: acme challenge route rejects traversal and non-token path escapes", async (t) => {
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

  const webroot = await fs.mkdtemp(path.join(os.tmpdir(), "dome-acme-"));
  const challengeDir = path.join(webroot, ".well-known", "acme-challenge");
  await fs.mkdir(challengeDir, { recursive: true });
  await fs.writeFile(path.join(challengeDir, "ok-token"), "ok", "utf8");
  await fs.writeFile(path.join(webroot, ".well-known", "sneaky.txt"), "sneaky", "utf8");
  t.after(async () => {
    await fs.rm(webroot, { recursive: true, force: true });
  });

  const { baseUrl } = await bootServer(t, { acmeWebroot: webroot });
  await request(baseUrl).get("/.well-known/acme-challenge/../sneaky.txt").expect(404);
  await request(baseUrl).get("/.well-known/acme-challenge/%2e%2e/sneaky.txt").expect(404);
});

test("integration: ACME uses the documented Certbot webroot when none is configured", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dome-acme-default-"));
  const configuredWebroot = process.env.ACME_WEBROOT;
  delete process.env.ACME_WEBROOT;
  t.after(async () => {
    if (configuredWebroot === undefined) delete process.env.ACME_WEBROOT;
    else process.env.ACME_WEBROOT = configuredWebroot;
    await fs.rm(directory, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(directory, "default-token"), "default challenge");

  // Map the deployment directory to a temporary fixture without creating files in /var/www.
  const serveStatic = express.static;
  t.mock.method(express, "static", (root, options) => {
    const expected = "/var/www/letsencrypt/.well-known/acme-challenge";
    return serveStatic(root === expected ? directory : path.join(directory, "wrong-root"), options);
  });
  const { default: router } = await import("../../src/routes/index.js?acme-default");
  const app = express();
  app.use(router);

  const response = await request(app).get("/.well-known/acme-challenge/default-token").expect(200);
  assert.equal(response.body.toString("utf8"), "default challenge");
});

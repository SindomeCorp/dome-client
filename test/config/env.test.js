/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import dotenv from "dotenv";

const configPath = new URL("../../src/config/index.js", import.meta.url);
const envPath = new URL("../../src/env.js", import.meta.url);

async function importConfig() {
  const cacheBust = `?v=${Date.now()}`;
  const source = await readFile(configPath, "utf8");
  const updated = source.replace("../env.js", `${envPath.href}${cacheBust}`);
  const encoded = Buffer.from(updated).toString("base64");
  const moduleUrl = `data:text/javascript;base64,${encoded}`;
  return import(moduleUrl);
}

test("config/env builds SSL configuration when keys are present", async (t) => {
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const { SSL_KEY, SSL_CERT, SSL_PORT } = process.env;
  t.after(() => {
    configMock.mock.restore();
    if (SSL_KEY === undefined) {
      delete process.env.SSL_KEY;
    } else {
      process.env.SSL_KEY = SSL_KEY;
    }
    if (SSL_CERT === undefined) {
      delete process.env.SSL_CERT;
    } else {
      process.env.SSL_CERT = SSL_CERT;
    }
    if (SSL_PORT === undefined) {
      delete process.env.SSL_PORT;
    } else {
      process.env.SSL_PORT = SSL_PORT;
    }
  });

  process.env.SSL_KEY = "key";
  process.env.SSL_CERT = "cert";
  delete process.env.SSL_PORT;
  let { default: cfg } = await importConfig();
  assert.ok(cfg.ssl);
  assert.equal(cfg.ssl.key, "key");
  assert.equal(cfg.ssl.cert, "cert");
  assert.equal(cfg.ssl.port, 443);

  process.env.SSL_PORT = "8443";
  ({ default: cfg } = await importConfig());
  assert.equal(cfg.ssl.port, 8443);

  process.env.SSL_KEY = "";
  process.env.SSL_CERT = "";
  delete process.env.SSL_PORT;
  ({ default: cfg } = await importConfig());
  assert.equal(cfg.ssl, undefined);
});

test("config/env applies defaults for node configuration", async (t) => {
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const keys = {
    NODE_MODE: "dev",
    NODE_PORT: 80,
    NODE_SOCKET_URL: "http://localhost:8080",
    NODE_SOCKET_URL_SSL: "",
    NODE_SOCKET_PROXIED: false,
    NODE_POWERED_BY: "Dome Client",
    SESSION_SECRET: "dev-session-secret-change-me"
  };
  const backup = {};
  for (const key of Object.keys(keys)) {
    backup[key] = process.env[key];
    delete process.env[key];
  }
  t.after(() => {
    configMock.mock.restore();
    for (const key of Object.keys(keys)) {
      if (backup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = backup[key];
      }
    }
  });
  const { default: cfg } = await importConfig();
  assert.deepEqual(cfg.node, {
    mode: "dev",
    port: 80,
    socketUrl: "http://localhost:8080",
    socketUrlSSL: "",
    socketProxied: false,
    poweredBy: "Dome Client",
    session: { secret: "dev-session-secret-change-me" }
  });
});

test("config/env uses overrides for node configuration", async (t) => {
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const overrides = {
    NODE_MODE: "production",
    NODE_PORT: "3001",
    NODE_SOCKET_URL: "http://example",
    NODE_SOCKET_URL_SSL: "https://secure",
    NODE_SOCKET_PROXIED: "true",
    NODE_POWERED_BY: "Overridden",
    SESSION_SECRET: "shhh"
  };
  const backup = {};
  for (const [key, value] of Object.entries(overrides)) {
    backup[key] = process.env[key];
    process.env[key] = value;
  }
  t.after(() => {
    configMock.mock.restore();
    for (const key of Object.keys(overrides)) {
      if (backup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = backup[key];
      }
    }
  });
  const { default: cfg } = await importConfig();
  assert.deepEqual(cfg.node, {
    mode: "production",
    port: 3001,
    socketUrl: "http://example",
    socketUrlSSL: "https://secure",
    socketProxied: true,
    poweredBy: "Overridden",
    session: { secret: "shhh" }
  });
});

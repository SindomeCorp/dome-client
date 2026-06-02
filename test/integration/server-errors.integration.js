/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

test("integration: route errors go through global 500 handler", async (t) => {
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
      multiMud: false,
      poweredBy: "Dome Client",
      session: {
        secret: "integration-test-secret"
      }
    },
    moo: {
      name: "Integration MUD",
      host: "127.0.0.1",
      port: 4444
    },
    guest: {
      connectCommand: "connect guest"
    },
    autocomplete: {
      enabled: false,
      p: "data/autocomplete/player.txt"
    },
    shorten: {
      enabled: false
    },
    remoteAuth: {
      enabled: false,
      host: "http://remoteauth.test",
      path: "/session/authenticate/",
      remoteSecret: "sekret"
    },
    status: {
      serviceUrl: ""
    }
  };

  moduleMock("../../src/config/index.js", { defaultExport: config });
  moduleMock("../../src/logger.js", {
    namedExports: {
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      })
    }
  });
  moduleMock("../../src/controllers/socket.js", {
    namedExports: {
      connection() {},
      error() {},
    }
  });

  const router = express.Router();
  router.get("/", () => {
    throw new Error("boom");
  });
  moduleMock("../../src/routes/index.js", { defaultExport: router });

  const { start, stop } = await import(`../../src/server.js?integration-errors=${Date.now()}`);
  const runtime = await start({ port: 0, ip: "127.0.0.1", skipBuild: true });
  t.after(async () => {
    await stop();
    t.mock.restoreAll();
  });

  const http = request(`http://127.0.0.1:${runtime.http.port}`);
  const res = await http.get("/").expect(500);
  assert.deepEqual(res.body, { error: "Internal Server Error" });
});

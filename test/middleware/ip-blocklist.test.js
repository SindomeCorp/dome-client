/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import { createIpBlocklistMiddleware } from "../../src/middleware/ip-blocklist.js";

test("ip blocklist middleware returns 403 for blocked clients", () => {
  const warnings = [];
  const middleware = createIpBlocklistMiddleware({
    blocklist: {
      has(ip) {
        return ip === "203.0.113.10";
      }
    },
    logger: {
      warn: (msg) => warnings.push(msg)
    },
    proxied: true
  });
  const req = {
    originalUrl: "/client",
    headers: {
      "x-forwarded-for": "203.0.113.10"
    },
    socket: {
      remoteAddress: "127.0.0.1"
    }
  };
  const res = {
    statusCode: 0,
    body: "",
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
    }
  };
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body, "Forbidden");
  assert.equal(nextCalled, false);
  assert.match(warnings[0], /Blocked request from 203\.0\.113\.10 to \/client/);
});

test("ip blocklist middleware passes allowed clients", () => {
  const middleware = createIpBlocklistMiddleware({
    blocklist: {
      has() {
        return false;
      }
    },
    logger: { warn() {} }
  });
  let nextCalled = false;

  middleware({ headers: {}, socket: { remoteAddress: "127.0.0.1" } }, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

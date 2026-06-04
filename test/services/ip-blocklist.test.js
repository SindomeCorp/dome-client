/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import { loadIpBlocklist, normalizeClientIp, resolveClientIpFromRequest } from "../../src/services/ip-blocklist.js";

test("loadIpBlocklist parses exact IP entries and ignores invalid lines", () => {
  const warnings = [];
  const infos = [];
  const fs = {
    readFileSync() {
      return [
        "# comment",
        "203.0.113.10",
        "::ffff:198.51.100.7",
        "not-an-ip",
        "",
        "2001:db8::1 # inline comment"
      ].join("\n");
    }
  };
  const logger = {
    info: (msg) => infos.push(msg),
    warn: (msg) => warnings.push(msg)
  };

  const blocklist = loadIpBlocklist({ filePath: "blocked.txt", fs, logger });

  assert.equal(blocklist.size, 3);
  assert.equal(blocklist.has("203.0.113.10"), true);
  assert.equal(blocklist.has("::ffff:198.51.100.7"), true);
  assert.equal(blocklist.has("2001:db8::1"), true);
  assert.equal(blocklist.has("203.0.113.11"), false);
  assert.match(warnings[0], /Ignoring invalid IP blocklist entry blocked\.txt:4 not-an-ip/);
  assert.match(infos[0], /Loaded 3 IP blocklist entries/);
});

test("loadIpBlocklist disables matching when no path is configured", () => {
  const fs = {
    readFileSync() {
      throw new Error("should not read");
    }
  };
  const logger = { info() {}, warn() {} };

  const blocklist = loadIpBlocklist({ filePath: "", fs, logger });

  assert.equal(blocklist.size, 0);
  assert.equal(blocklist.has("203.0.113.10"), false);
});

test("loadIpBlocklist logs and disables matching when file cannot be read", () => {
  const warnings = [];
  const err = new Error("missing");
  const fs = {
    readFileSync() {
      throw err;
    }
  };
  const logger = {
    info() {},
    warn: (...args) => warnings.push(args)
  };

  const blocklist = loadIpBlocklist({ filePath: "missing.txt", fs, logger });

  assert.equal(blocklist.size, 0);
  assert.equal(blocklist.has("203.0.113.10"), false);
  assert.equal(warnings[0][0], "Unable to load IP blocklist from missing.txt");
  assert.equal(warnings[0][1], err);
});

test("resolveClientIpFromRequest follows NODE_SOCKET_PROXIED-style forwarded handling", () => {
  const req = {
    ip: "10.0.0.2",
    headers: {
      "x-forwarded-for": "203.0.113.10, 10.0.0.1"
    },
    socket: {
      remoteAddress: "::ffff:198.51.100.7"
    }
  };

  assert.equal(resolveClientIpFromRequest(req, { proxied: true }), "203.0.113.10");
  assert.equal(resolveClientIpFromRequest(req, { proxied: false }), "10.0.0.2");
  assert.equal(normalizeClientIp("::ffff:198.51.100.7"), "198.51.100.7");
});

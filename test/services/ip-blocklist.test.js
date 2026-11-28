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

test("loadIpBlocklist disables matching quietly when no path is configured", (t) => {
  const fs = { readFileSync: t.mock.fn(() => { throw new Error("should not read"); }) };
  const logger = { info: t.mock.fn(), warn: t.mock.fn() };

  const blocklist = loadIpBlocklist({ filePath: "", fs, logger });

  assert.equal(blocklist.size, 0);
  assert.equal(blocklist.has("203.0.113.10"), false);
  assert.equal(fs.readFileSync.mock.callCount(), 0);
  assert.equal(logger.info.mock.callCount(), 0);
  assert.equal(logger.warn.mock.callCount(), 0);
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

test("default IP resolution tolerates incomplete requests and prioritizes direct addresses", () => {
  assert.equal(resolveClientIpFromRequest(undefined), "");
  assert.equal(resolveClientIpFromRequest({}), "");
  assert.equal(resolveClientIpFromRequest({ connection: { remoteAddress: "192.0.2.2" } }), "192.0.2.2");
  assert.equal(resolveClientIpFromRequest({
    headers: { "x-forwarded-for": "198.51.100.2" },
    socket: { remoteAddress: "192.0.2.3" }
  }), "192.0.2.3");
  assert.equal(normalizeClientIp(123), "");
});

test("matches IPv6 exactly and treats unusable lookup values as absent", () => {
  const list = loadIpBlocklist({
    filePath: "fixture-ip-list",
    fs: {
      readFileSync(_file, encoding) {
        assert.equal(encoding, "utf8");
        return "2001:db8::7";
      }
    },
    logger: { info() {}, warn() {} }
  });
  assert.equal(list.has("2001:db8::7"), true);
  assert.equal(list.has("2001:db8::8"), false);
  assert.equal(list.has("not-an-ip"), false);
  assert.equal(list.has(null), false);
});

test("IPv4-mapped IPv6 address spellings match the same exact IP", () => {
  const list = loadIpBlocklist({
    filePath: "fixture-ip-list",
    fs: { readFileSync: () => "203.0.113.10\r\n::ffff:c633:6407" },
    logger: { info() {}, warn() {} }
  });

  assert.equal(list.size, 2);
  assert.equal(list.has("::FFFF:cb00:710a"), true);
  assert.equal(list.has("0:0:0:0:0:ffff:cb00:710a"), true);
  assert.equal(list.has("198.51.100.7"), true);
  assert.equal(list.has("::ffff:c633:6408"), false);
});

test("address normalization unwraps dotted mapped IPv4 and preserves other IPv6 addresses", () => {
  assert.equal(normalizeClientIp("  ::FFFF:192.0.2.1  "), "192.0.2.1");
  assert.equal(normalizeClientIp("::ffff:c000:201"), "::ffff:c000:201");
  assert.equal(normalizeClientIp("2001:db8::ffff:192.0.2.1"), "2001:db8::ffff:192.0.2.1");
  assert.equal(normalizeClientIp("1:2:3::192.0.2.1"), "1:2:3::192.0.2.1");
});

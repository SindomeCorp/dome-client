/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import { parse, deviceCapture } from "../../src/services/ua.js";

const phoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15A372 Safari/604.1";
const tabletUA = "Mozilla/5.0 (Linux; Android 8.0.0; SM-T810 Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Safari/537.36";
const tvUA = "Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/1.1 TV Safari/538.1";
const desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36";
const botUA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const unknownUA = "UnknownAgent/1.0";

test("parse returns defaults for empty UA", () => {
  const ua = parse();
  assert.equal(ua.toAgent(), "Other 0.0.0");
  assert.equal(ua.os.toString(), "");
  assert.equal(ua.device.toString(), "Other 0.0.0");
  assert.equal(ua.device.type(), "desktop");
});

test("parse extracts browser and OS information", () => {
  const uaString = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36";
  const ua = parse(uaString);
  assert.equal(ua.toAgent(), "Chrome 98.0.4758.102");
  assert.equal(ua.os.toString(), "Windows 10");
});

test("parse identifies device types and helpers", () => {
  const cases = [
    { ua: phoneUA, toString: "Apple iPhone", type: "phone" },
    { ua: tabletUA, toString: "Samsung SM-T810", type: "tablet" },
    { ua: tvUA, toString: "Samsung smarttv", type: "tv" },
    { ua: desktopUA, toString: "Other 0.0.0", type: "desktop" },
    { ua: botUA, toString: "Other 0.0.0", type: "bot" },
    { ua: unknownUA, toString: "Other 0.0.0", type: "desktop" },
    { ua: undefined, toString: "Other 0.0.0", type: "desktop" }
  ];

  for (const { ua, toString, type } of cases) {
    const parsed = parse(ua);
    assert.equal(parsed.device.toString(), toString);
    assert.equal(parsed.device.type(), type);
  }
});

test("deviceCapture assigns device for various user agents", () => {
  const cases = [
    { ua: desktopUA, type: "desktop" },
    { ua: tabletUA, type: "tablet" },
    { ua: phoneUA, type: "phone" },
    { ua: tvUA, type: "tv" },
    { ua: botUA, type: "bot" },
    { ua: unknownUA, type: "desktop" }
  ];

  for (const { ua, type } of cases) {
    const middleware = deviceCapture();
    const req = { headers: { "user-agent": ua } };
    let called = false;
    middleware(req, {}, () => { called = true; });
    assert.equal(req.device, type);
    assert.ok(called);
  }
});

test("deviceCapture defaults to desktop without user-agent", () => {
  const middleware = deviceCapture();
  const req = { headers: {} };
  let called = false;
  middleware(req, {}, () => { called = true; });
  assert.equal(req.device, "desktop");
  assert.ok(called);
});

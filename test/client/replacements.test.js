import { test } from "node:test";
import assert from "node:assert/strict";
import { urlRegex, ipRegex, hostnameRegex } from "../../src/client/e-replacements.js";
import { xterm256Colors } from "../../src/client/xterm-colors.js";
import { subs } from "../../src/client/b-variables.js";

function reset(regex) {
  if (regex) {
    regex.lastIndex = 0;
  }
}

function exactMatch(regex, str) {
  reset(regex);
  const m = str.match(regex);
  return !!m && m[0] === str;
}

function applySubs(text) {
  let out = text;
  subs.forEach(sub => {
    out = out.replace(sub.pattern, sub.replacement);
  });
  return out;
}

test("urlRegex matches http/https links and not plain text", () => {
  assert.ok(urlRegex.test("http://example.com"));
  reset(urlRegex);
  assert.ok(urlRegex.test("https://example.com/path"));
  reset(urlRegex);
  assert.equal(urlRegex.test("just some text"), false);
});

test("ipRegex matches IPv4 and IPv6", () => {
  assert.ok(exactMatch(ipRegex, "192.168.0.1"));
  assert.ok(exactMatch(ipRegex, "2001:db8::1"));
  assert.equal(exactMatch(ipRegex, "example.com"), false);
  assert.equal(exactMatch(ipRegex, "999.999.999.999"), false);
  assert.equal(exactMatch(ipRegex, "2001:db8::1::"), false);
});

test("hostnameRegex matches hostnames and not emails", () => {
  assert.ok(exactMatch(hostnameRegex, "example.com"));
  reset(hostnameRegex);
  assert.equal(hostnameRegex.test("rat.in.the.walls@gmail.com"), false);
});

test("xterm256 foreground color replacement", () => {
  const input = "\u001b[38;5;1mfoo";
  const output = applySubs(input);
  assert.equal(output, `<span class="xterm256-${xterm256Colors[1]}">foo`);
});

test("xterm256 background color replacement", () => {
  const input = "\u001b[48;5;2mbar";
  const output = applySubs(input);
  assert.equal(output, `<span class="xterm256-bg-${xterm256Colors[2]}">bar`);
});

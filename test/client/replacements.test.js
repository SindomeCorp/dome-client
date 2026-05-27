import { test } from "node:test";
import assert from "node:assert/strict";
import { urlRegex, ipRegex, hostnameRegex } from "../../src/client/e-replacements.js";
import { xterm256Colors } from "../../src/client/xterm-colors.js";
import { createAnsiRenderer } from "../../src/client/ansi-renderer.js";

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

function applyAnsi(text) {
  const renderer = createAnsiRenderer();
  return renderer.renderChunk(text);
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
  const output = applyAnsi(input);
  assert.equal(output, `<span class="xterm256-${xterm256Colors[1]}">foo</span>`);
});

test("xterm256 background color replacement", () => {
  const input = "\u001b[48;5;2mbar";
  const output = applyAnsi(input);
  assert.equal(output, `<span class="xterm256-bg-${xterm256Colors[2]}">bar</span>`);
});

test("truecolor foreground replacement", () => {
  const input = "\u001b[38;2;12;34;56mfoo";
  const output = applyAnsi(input);
  assert.equal(output, "<span style=\"color: rgb(12 34 56)\">foo</span>");
});

test("truecolor background replacement", () => {
  const input = "\u001b[48;2;1;200;255mbar";
  const output = applyAnsi(input);
  assert.equal(output, "<span style=\"background-color: rgb(1 200 255)\">bar</span>");
});

test("truecolor and xterm256 coexist in one line", () => {
  const input = "\u001b[38;5;1mA\u001b[38;2;10;20;30mB";
  const output = applyAnsi(input);
  assert.equal(
    output,
    `<span class="xterm256-${xterm256Colors[1]}">A</span><span style="color: rgb(10 20 30)">B</span>`
  );
});

test("handles blink and bold reset SGR sequences", () => {
  const input = "\u001b[5mblink\u001b[25m plain \u001b[1mbold\u001b[22m end";
  const output = applyAnsi(input);
  assert.equal(output, "<span class=\"ansi-slow-blink\">blink</span> plain <span class=\"ansi-bold\" style=\"font-weight: bold\">bold</span> end");
});

test("handles inverse on/off sequences", () => {
  const input = "\u001b[7minverse\u001b[27m normal";
  const output = applyAnsi(input);
  assert.equal(output, "<span class=\"ansi-inverse\">inverse</span> normal");
});

test("strips unsupported sgr sequences instead of rendering raw escape text", () => {
  const input = "\u001b[123mtext";
  const output = applyAnsi(input);
  assert.equal(output, "text");
});

test("persists state across chunks and handles split CSI tokens", () => {
  const renderer = createAnsiRenderer();
  const out1 = renderer.renderChunk("\u001b[3");
  const out2 = renderer.renderChunk("8;5;2mgreen");
  const out3 = renderer.renderChunk(" text\u001b[0m done");
  assert.equal(out1, "");
  assert.equal(out2, `<span class="xterm256-${xterm256Colors[2]}">green</span>`);
  assert.equal(out3, `<span class="xterm256-${xterm256Colors[2]}"> text</span> done`);
});

test("resets foreground and background independently", () => {
  const input = "\u001b[38;5;1;48;5;4mX\u001b[39mY\u001b[49mZ";
  const output = applyAnsi(input);
  assert.equal(
    output,
    `<span class="xterm256-${xterm256Colors[1]} xterm256-bg-${xterm256Colors[4]}">X</span>` +
      `<span class="xterm256-bg-${xterm256Colors[4]}">Y</span>Z`
  );
});

test("inverse swaps fg and bg classes", () => {
  const input = "\u001b[38;5;1;48;5;4mA\u001b[7mB\u001b[27mC";
  const output = applyAnsi(input);
  assert.equal(
    output,
    `<span class="xterm256-${xterm256Colors[1]} xterm256-bg-${xterm256Colors[4]}">A</span>` +
      `<span class="xterm256-${xterm256Colors[4]} xterm256-bg-${xterm256Colors[1]}">B</span>` +
      `<span class="xterm256-${xterm256Colors[1]} xterm256-bg-${xterm256Colors[4]}">C</span>`
  );
});

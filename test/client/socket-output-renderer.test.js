import { test } from "node:test";
import assert from "node:assert/strict";
/* global document */
import setupDom from "../../test-support/setup-dom.js";
import {
  createSocketOutputRenderer,
  wrapLinesToDivs
} from "../../src/client/features/terminal/socket-output-renderer.js";

function createClient() {
  return {
    alert: { active: false },
    buffer: document.querySelector("#buffer"),
    parseYouTubeID: () => null,
    preferences: {
      imagePreview: false,
      performanceBuffer: 0,
      sdwcNowrapBlocks: false
    },
    urlPatterns: {
      images: /$a^/,
      videos: /$a^/
    }
  };
}

function createLogger(t) {
  return {
    debug: t.mock.fn(),
    info: t.mock.fn(),
    warn: t.mock.fn()
  };
}

test("HTTPS short links preserve their scheme and opaque keys remain links", (t) => {
  setupDom(t, "<!doctype html><html><body><div id=\"buffer\"></div></body></html>");
  const client = createClient();
  client.preferences.imagePreview = true;
  client.urlPatterns = { images: /png|jpg|gif|jpeg$/, videos: /mp4|gifv$/ };
  const renderer = createSocketOutputRenderer({
    client,
    logger: createLogger(t),
    ansiRenderer: { renderChunk: (segment) => segment, resetState: () => {} }
  });
  renderer.appendOutputSegment("https://sindo.me/abc123");
  assert.equal(client.buffer.querySelector("a").getAttribute("href"), "https://sindo.me/abc123");
  assert.equal(client.buffer.querySelector("img"), null);
  renderer.appendOutputSegment("https://sindo.me/abc123.png");
  assert.equal(client.buffer.querySelector("img").getAttribute("src"), "https://sindo.me/abc123.png");
});

test("preview controls use pathname extensions in both automatic and collapsed modes", (t) => {
  setupDom(t, "<!doctype html><html><body><div id=\"buffer\"></div></body></html>");
  const client = createClient();
  const renderer = createSocketOutputRenderer({
    client, logger: createLogger(t),
    ansiRenderer: { renderChunk: (segment) => segment, resetState: () => {} }
  });
  for (const expanded of [false, true]) {
    client.preferences.imagePreview = expanded;
    client.buffer.innerHTML = "";
    renderer.appendOutputSegment("https://example.com/photo.JPEG?size=400 https://example.com/image.webp#preview https://example.com/view?file=photo.png https://jpg.example.com/page ftp://example.com/file.png");
    assert.equal(client.buffer.querySelectorAll("i[data-image-url]").length, 2);
    assert.equal(client.buffer.querySelectorAll("img").length, expanded ? 2 : 0);
    if (expanded) assert.equal(client.buffer.querySelector("img").getAttribute("src"), "https://example.com/photo.JPEG?size=400");
  }
});

test("wrapLinesToDivs preserves blank output lines without trailing blank", () => {
  assert.equal(
    wrapLinesToDivs("one\n\n<span style=\"color:red\"></span>\ntwo\n"),
    "<div>one</div><div><br></div><div><br></div><div>two</div>"
  );
});

test("socket output renderer linkifies hosts and wraps selectable references", (t) => {
  setupDom(t, "<!doctype html><html><body><div id=\"buffer\"></div></body></html>");
  const client = createClient();
  const renderer = createSocketOutputRenderer({
    client,
    logger: createLogger(t),
    ansiRenderer: { renderChunk: (segment) => segment, resetState: () => {} }
  });

  renderer.appendOutputSegment("[host=192.168.0.1] #42 $thing\n");

  assert.equal(
    client.buffer.innerHTML,
    "<div><a href=\"https://whatismyipaddress.com/ip/192.168.0.1\" target=\"_new\" rel=\"noopener noreferrer\">192.168.0.1</a> <span class=\"all-copy\">#42</span> <span class=\"all-copy\">$thing</span></div>"
  );
});

test("socket output renderer handles alert matching and scrollback pruning", (t) => {
  setupDom(t, "<!doctype html><html><body><div id=\"buffer\"><div>old</div></div></body></html>");
  const client = createClient();
  client.alert = {
    active: true,
    pattern: /target/,
    tone: { play: t.mock.fn() }
  };
  client.preferences.performanceBuffer = 1;
  client.windowAlert = t.mock.fn();

  const renderer = createSocketOutputRenderer({
    client,
    logger: createLogger(t),
    ansiRenderer: { renderChunk: (segment) => segment, resetState: () => {} }
  });

  renderer.appendOutputSegment("TARGET\n");
  renderer.pruneBuffer();

  assert.equal(client.alert.tone.play.mock.callCount(), 1);
  assert.equal(client.windowAlert.mock.callCount(), 1);
  assert.equal(client.buffer.innerHTML, "<div>TARGET</div>");
});

test("socket output renderer routes nowrap output into marker block", (t) => {
  setupDom(t, "<!doctype html><html><body><div id=\"buffer\"></div></body></html>");
  const client = createClient();
  client.preferences.sdwcNowrapBlocks = true;
  const logger = createLogger(t);
  const renderer = createSocketOutputRenderer({
    client,
    logger,
    ansiRenderer: { renderChunk: (segment) => segment, resetState: () => {} }
  });

  renderer.startSdwcNowrapBlock();
  renderer.appendOutputSegment("inside\n");
  renderer.endSdwcNowrapBlock();
  renderer.appendOutputSegment("outside\n");

  assert.equal(
    client.buffer.innerHTML,
    "<div class=\"sdwc-nowrap-block\"><div>inside</div></div><div>outside</div>"
  );
  assert.equal(logger.info.mock.callCount(), 2);
});

test("socket output renderer preserves spaces inside nowrap output", (t) => {
  setupDom(t, "<!doctype html><html><body><div id=\"buffer\"></div></body></html>");
  const client = createClient();
  client.preferences.sdwcNowrapBlocks = true;
  const renderer = createSocketOutputRenderer({
    client,
    logger: createLogger(t),
    ansiRenderer: { renderChunk: (segment) => segment, resetState: () => {} }
  });

  renderer.startSdwcNowrapBlock();
  renderer.appendOutputSegment("  left    right\n");
  renderer.endSdwcNowrapBlock();

  const block = client.buffer.querySelector(".sdwc-nowrap-block");
  assert.equal(block?.textContent, "  left    right");
});

test("socket output renderer renders image, video, and YouTube previews", (t) => {
  setupDom(t, "<!doctype html><html><body><div id=\"buffer\"></div></body></html>");
  let now = 1;
  const client = createClient();
  Object.defineProperty(client.buffer, "clientWidth", { value: 640, configurable: true });
  client.parseYouTubeID = (url) => url.includes("youtu.be") ? "abc123" : null;
  client.preferences.imagePreview = true;
  client.urlPatterns = {
    images: /\.(png|jpg)$/i,
    videos: /\.(gifv|mp4)$/i
  };
  const renderer = createSocketOutputRenderer({
    client,
    logger: createLogger(t),
    ansiRenderer: { renderChunk: (segment) => segment, resetState: () => {} },
    nowMs: () => now++
  });

  renderer.appendOutputSegment("http://example.com/a.png http://example.com/clip.gifv https://youtu.be/watch\n");

  assert.match(client.buffer.innerHTML, /<img class="shown-image"/);
  assert.match(client.buffer.innerHTML, /<video class="shown-image"/);
  assert.match(client.buffer.innerHTML, /clip\.mp4/);
  assert.match(client.buffer.innerHTML, /https:\/\/www\.youtube\.com\/embed\/abc123/);
  assert.match(client.buffer.innerHTML, /icon-chevron-down/);
});

test("socket output renderer handles alert strings, hostnames, nowrap warnings, and stale blocks", (t) => {
  setupDom(t, "<!doctype html><html><body><div id=\"buffer\"></div></body></html>");
  const client = createClient();
  client.alert = {
    active: true,
    pattern: "danger",
    tone: { play: t.mock.fn() }
  };
  client.windowAlert = t.mock.fn();
  client.preferences.sdwcNowrapBlocks = true;
  const logger = createLogger(t);
  const renderer = createSocketOutputRenderer({
    client,
    logger,
    ansiRenderer: { renderChunk: (segment) => segment, resetState: t.mock.fn() }
  });

  assert.equal(renderer.appendOutputSegment(""), 0);
  renderer.appendOutputSegment("[host=moo.example.org] danger\n");
  renderer.startSdwcNowrapBlock();
  renderer.startSdwcNowrapBlock();
  client.buffer.lastChild.remove();
  renderer.appendOutputSegment("after stale block\n");
  renderer.endSdwcNowrapBlock();
  renderer.endSdwcNowrapBlock();

  assert.match(client.buffer.innerHTML, /hostname-ip\?DOMAINNAME=moo\.example\.org/);
  assert.match(client.buffer.innerHTML, /after stale block/);
  assert.equal(client.alert.tone.play.mock.callCount(), 1);
  assert.equal(client.windowAlert.mock.callCount(), 1);
  assert.equal(logger.warn.mock.callCount(), 3);
});

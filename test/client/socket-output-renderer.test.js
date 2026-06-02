import { test } from "node:test";
import assert from "node:assert/strict";
/* global document */
import setupDom from "../../test-support/setup-dom.js";
import {
  createSocketOutputRenderer,
  wrapLinesToDivs
} from "../../src/client/socket-output-renderer.js";

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

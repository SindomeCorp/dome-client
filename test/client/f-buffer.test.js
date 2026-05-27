import { test } from "node:test";
import assert from "node:assert/strict";
/* global document */
import setupDom from "../../test-support/setup-dom.js";
import { dome } from "../../src/client/b-variables.js";

const loadOutputParser = async (t) => {
  setupDom(
    t,
    "<!doctype html><html><body><div id=\"buffer\"><div>old1</div><div>old2</div></div><table id=\"who-table\"><tr class=\"who-header\"></tr></table><div id=\"how-many-connected\"></div></body></html>"
  );
  dome.buffer = document.querySelector("#buffer");
  dome.preferences = { performanceBuffer: 2, imagePreview: false, sdwcNowrapBlocks: false };
  dome.scrollBuffer = () => { dome.scrolled = true; };
  dome.urlPatterns = { images: /$a^/, videos: /$a^/ };
  dome.parseYouTubeID = () => null;
  dome.makeEditor = () => null;
  dome.spawned = {};
  dome.updateEditorListView = () => {};
  dome.channel = null;
  dome.alert = { active: false };
  await import("../../src/client/f-buffer.js");
  dome.setupOutputParser();
};

test("parseSocketData appends lines and trims buffer", async (t) => {
  await loadOutputParser(t);
  dome.parseSocketData("line1\nline2\n");
  const html = dome.buffer.innerHTML;
  assert.ok(!html.includes("old1"));
  assert.ok(html.includes("line2"));
  assert.equal(dome.buffer.childNodes.length, 2);
  assert.equal(dome.scrolled, true);
});

test("parseSocketData preserves blank lines", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.parseSocketData("line1\n\nline2\n");
  const html = dome.buffer.innerHTML;
  assert.ok(html.includes("<div><br></div>"));
  assert.equal(html, "<div>line1</div><div><br></div><div>line2</div>");
});

test("parseSocketData alerts on case-insensitive mentions", async (t) => {
  await loadOutputParser(t);
  dome.alert.active = true;
  dome.alert.pattern = /user/; // lacks 'i' flag
  dome.alert.tone = { play: t.mock.fn() };
  dome.windowAlert = t.mock.fn();
  dome.parseSocketData("USER says hi\n");
  assert.equal(dome.alert.tone.play.mock.callCount(), 1);
  assert.equal(dome.windowAlert.mock.callCount(), 1);
});

test("parseSocketData handles CRLF line endings", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.parseSocketData("line1\r\n\r\nline2\r\n");
  assert.equal(dome.buffer.innerHTML, "<div>line1</div><div><br></div><div>line2</div>");
});

test("parseSocketData converts host tags to links", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.parseSocketData("[host=192.168.0.1] and [host=example.com]\n");
  assert.equal(
    dome.buffer.innerHTML,
    "<div><a href=\"https://whatismyipaddress.com/ip/192.168.0.1\" target=\"_new\" rel=\"noopener noreferrer\">192.168.0.1</a> and <a href=\"https://whatismyipaddress.com/hostname-ip?DOMAINNAME=example.com\" target=\"_new\" rel=\"noopener noreferrer\">example.com</a></div>"
  );
});

test("parseSocketData doesn't insert extra blank line across segments", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.parseSocketData("line1\n");
  dome.parseSocketData("line2\n");
  assert.equal(dome.buffer.innerHTML, "<div>line1</div><div>line2</div>");
});

test("parseSocketData preserves blank line split across segments", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.parseSocketData("line1\n");
  dome.parseSocketData("\nline2\n");
  assert.equal(dome.buffer.innerHTML, "<div>line1</div><div><br></div><div>line2</div>");
});

test("parseSocketData handles color codes on empty lines", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  const ESC = "\u001b";
  const color = `${ESC}[31m${ESC}[0m`;
  dome.parseSocketData(`line1\n${color}\nline2\n`);
  assert.equal(dome.buffer.innerHTML, "<div>line1</div><div><br></div><div>line2</div>");
});

test("parseSocketData renders truecolor and reset sequences", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  const ESC = "\u001b";
  dome.parseSocketData(`${ESC}[38;2;12;34;56mcolor${ESC}[0m plain\n`);
  assert.equal(
    dome.buffer.innerHTML,
    "<div><span style=\"color: rgb(12 34 56)\">color</span> plain</div>"
  );
});

test("parseSocketData keeps xterm256 class mapping intact with truecolor", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  const ESC = "\u001b";
  dome.parseSocketData(`${ESC}[38;5;1mred ${ESC}[38;2;10;20;30mrgb\n`);
  const html = dome.buffer.innerHTML;
  assert.ok(html.includes("xterm256-Red"));
  assert.ok(html.includes("style=\"color: rgb(10 20 30)\""));
});

test("parseSocketData renders UUID split across lines separately", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.parseSocketData("before 2d6116e8\n-3d9b-46e3-bdfa-3f300f316756 after\n");
  assert.equal(
    dome.buffer.innerHTML,
    "<div>before 2d6116e8</div><div>-3d9b-46e3-bdfa-3f300f316756 after</div>"
  );
});

test("parseSocketData renders email split across lines separately", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.parseSocketData("before ses\neclad@gmail.com after\n");
  assert.equal(
    dome.buffer.innerHTML,
    "<div>before ses</div><div>eclad@gmail.com after</div>"
  );
});

test("parseSocketData toggles active editor state", async (t) => {
  await loadOutputParser(t);
  dome.makeEditor = t.mock.fn(() => null);
  const start = "#$# edit name: foo upload: @program foo\r\nline1";
  dome.parseSocketData(start);
  assert.equal(dome.activeEditor.readingContent, true);
  dome.parseSocketData("\n.\r\n");
  assert.equal(dome.activeEditor.readingContent, false);
  assert.equal(dome.makeEditor.mock.calls.length, 1);
});

test("parseSocketData closes editor when dot terminator is split across segments", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.makeEditor = t.mock.fn(() => null);

  dome.parseSocketData("#$# edit name: foo upload: @program foo\nline1\n.");
  assert.equal(dome.activeEditor.readingContent, true);

  dome.parseSocketData("\nchannel message\n");
  assert.equal(dome.activeEditor.readingContent, false);
  assert.equal(dome.makeEditor.mock.calls.length, 1);
  assert.deepEqual(dome.makeEditor.mock.calls[0].arguments[0], {
    readingContent: true,
    buffer: "line1\n",
    editorName: "foo",
    uploadCommand: "@program foo"
  });
  assert.equal(dome.buffer.innerHTML, "<div>channel message</div>");
});

test("parseSocketData supports empty editor content terminated in same segment", async (t) => {
  await loadOutputParser(t);
  dome.makeEditor = t.mock.fn(() => null);

  dome.parseSocketData("#$# edit name: foo upload: @program foo\n.\n");

  assert.equal(dome.activeEditor.readingContent, false);
  assert.equal(dome.makeEditor.mock.calls.length, 1);
  assert.equal(dome.makeEditor.mock.calls[0].arguments[0].buffer, "");
});

test("parseSocketData parses SDWC VERBS payload and forwards it to IDE", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.ideWindow = { closed: false, postMessage: t.mock.fn() };

  dome.parseSocketData("#$# SDWC%%verbs%%[\"#18657\",[[\"#18657\",\"rd\",\"@matrix\",[[\"any\",\"any\",\"any\"]]]]]\n");

  assert.equal(dome.ideWindow.postMessage.mock.calls.length, 1);
  assert.deepEqual(dome.ideWindow.postMessage.mock.calls[0].arguments, [
    {
      type: "ide-object-verbs",
      payload: ["#18657", [["#18657", "rd", "@matrix", [["any", "any", "any"]]]]]
    },
    "*"
  ]);
  assert.equal(dome.buffer.innerHTML, "");
});

test("parseSocketData parses SDWC PROPS payload and forwards it to IDE", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.ideWindow = { closed: false, postMessage: t.mock.fn() };

  dome.parseSocketData("#$# SDWC%%PROPS%%{\"id\":\"#18657\",\"name\":\"foo\"}\n");

  assert.equal(dome.ideWindow.postMessage.mock.calls.length, 1);
  assert.deepEqual(dome.ideWindow.postMessage.mock.calls[0].arguments, [
    {
      type: "ide-object-props",
      payload: { id: "#18657", name: "foo" }
    },
    "*"
  ]);
  assert.equal(dome.buffer.innerHTML, "");
});

test("parseSocketData parses SDWC VERB-OVERLAY payload and forwards it to IDE", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.ideWindow = { closed: false, postMessage: t.mock.fn() };

  dome.parseSocketData("#$# SDWC%%VERB-OVERLAY%%{\"object\":\"#18657\",\"verb\":\"@matrix\",\"value\":\"x\"}\n");

  assert.equal(dome.ideWindow.postMessage.mock.calls.length, 1);
  assert.deepEqual(dome.ideWindow.postMessage.mock.calls[0].arguments, [
    {
      type: "ide-verb-overlay",
      objectId: "#18657",
      verbName: "@matrix",
      payload: { object: "#18657", verb: "@matrix", value: "x" }
    },
    "*"
  ]);
  assert.equal(dome.buffer.innerHTML, "");
});

test("parseSocketData parses SDWC PROP-OVERLAY payload and forwards it to IDE", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.ideWindow = { closed: false, postMessage: t.mock.fn() };

  dome.parseSocketData("#$# SDWC%%PROP-OVERLAY%%{\"object\":\"#18657\",\"property\":\"name\",\"value\":\"Slither\"}\n");

  assert.equal(dome.ideWindow.postMessage.mock.calls.length, 1);
  assert.deepEqual(dome.ideWindow.postMessage.mock.calls[0].arguments, [
    {
      type: "ide-prop-overlay",
      objectId: "#18657",
      propertyName: "name",
      payload: { object: "#18657", property: "name", value: "Slither" }
    },
    "*"
  ]);
  assert.equal(dome.buffer.innerHTML, "");
});

test("parseSocketData does not show fade text for SDWC meta lines", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.statusDisplay = {};
  dome.setFadeText = t.mock.fn();

  dome.parseSocketData("#$#   sdwc%%unknown%%{\"x\":1}\n");

  assert.equal(dome.setFadeText.mock.calls.length, 0);
  assert.equal(dome.buffer.innerHTML, "");
});

test("parseSocketData streams lines into sdwc-nowrap-block while marker mode is active", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.preferences.sdwcNowrapBlocks = true;

  dome.parseSocketData("#$# SDWC-START-NOWRAP\n");
  dome.parseSocketData("line-one\nline-two\n");
  dome.parseSocketData("#$# SDWC-END-NOWRAP\n");
  dome.parseSocketData("line-three\n");

  assert.equal(
    dome.buffer.innerHTML,
    "<div class=\"sdwc-nowrap-block\"><div>line-one</div><div>line-two</div></div><div>line-three</div>"
  );
});

test("parseSocketData ignores nowrap markers when sdwc nowrap option is disabled", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.preferences.sdwcNowrapBlocks = false;

  dome.parseSocketData("#$# SDWC-START-NOWRAP\nline-a\n");
  dome.parseSocketData("#$# SDWC-END-NOWRAP\nline-b\n");

  assert.equal(dome.buffer.innerHTML, "<div>line-a</div><div>line-b</div>");
});

test("parseSocketData keeps nowrap mode active across chunks until END marker", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.preferences.sdwcNowrapBlocks = true;

  dome.parseSocketData("#$# SDWC-START-NOWRAP\nline-a\n");
  dome.parseSocketData("line-b\n");
  dome.parseSocketData("#$# SDWC-END-NOWRAP\n");

  const block = dome.buffer.querySelector(".sdwc-nowrap-block");
  assert.ok(block);
  assert.equal(block?.innerHTML, "<div>line-a</div><div>line-b</div>");
});

test("parseSocketData keeps same-chunk nowrap content inside marker block", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.preferences.sdwcNowrapBlocks = true;

  dome.parseSocketData("#$# SDWC-START-NOWRAP\nline\n#$# SDWC-END-NOWRAP\n");

  assert.equal(
    dome.buffer.innerHTML,
    "<div class=\"sdwc-nowrap-block\"><div>line</div></div>"
  );
});

test("parseSocketData preserves target order around same-chunk nowrap markers", async (t) => {
  await loadOutputParser(t);
  dome.buffer.innerHTML = "";
  dome.preferences.performanceBuffer = 0;
  dome.preferences.sdwcNowrapBlocks = true;

  dome.parseSocketData("before\n#$# SDWC-START-NOWRAP\ninside\n#$# SDWC-END-NOWRAP\nafter\n");

  assert.equal(
    dome.buffer.innerHTML,
    "<div>before</div><div class=\"sdwc-nowrap-block\"><div>inside</div></div><div>after</div>"
  );
});

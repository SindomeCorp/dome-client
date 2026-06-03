import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLogHtml } from "../../src/shared/log-template.js";

test("buildLogHtml inlines style content and buffer markup", () => {
  const html = buildLogHtml("<p>hello</p>", "body { color: red; }");

  assert.match(html, /<style>body \{ color: red; \}<\/style>/);
  assert.match(html, /<div id="lineBuffer"><p>hello<\/p><\/div>/);
});

test("buildLogHtml does not include remote stylesheet links", () => {
  const html = buildLogHtml("<p>hello</p>", ".x { color: blue; }");

  assert.doesNotMatch(html, /sindome\.org\/css\/dome\.css/);
  assert.doesNotMatch(html, /play\.sindome\.org\/css\/client\.css/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.doesNotMatch(html, /<base href=/);
});

test("buildLogHtml can use legacy linked stylesheet mode", () => {
  const html = buildLogHtml("<p>hello</p>", ".x { color: blue; }", false);

  assert.match(html, /https:\/\/fonts\.googleapis\.com\/css\?family=Source\+Code\+Pro\|Quantico:400,400italic,700\|Roboto\+Mono\|Comic\+Mono/);
  assert.match(html, /<base href="https:\/\/play\.sindome\.org">/);
  assert.match(html, /https:\/\/www\.sindome\.org\/css\/dome\.css/);
  assert.match(html, /https:\/\/play\.sindome\.org\/css\/client\.css/);
  assert.doesNotMatch(html, /<style>\.x \{ color: blue; \}<\/style>/);
});

test("buildLogHtml escapes style end tags in css payload", () => {
  const html = buildLogHtml("", "/* test */ </style><script>bad()</script>");

  assert.match(html, /<style>\/\* test \*\/ <\\\/style><script>bad\(\)<\/script><\/style>/);
});

test("buildLogHtml preserves style-like buffer payload", () => {
  const payload = "<span></style><script>bad()</script></span>";
  const html = buildLogHtml(payload, "body{}");

  assert.match(html, /<style>body\{\}<\/style>/);
  assert.match(html, /<div id="lineBuffer"><span><\/style><script>bad\(\)<\/script><\/span><\/div>/);
});

test("buildLogHtml preserves large unicode and malformed markup payloads", () => {
  const line = "alpha \u001b[31mred\u001b[0m \u3053\u3093\u306b\u3061\u306f \ud83c\udf19\n";
  const payload = `<pre>${line.repeat(3000)}</pre>` + ("<!--x--><div><span><p></div></span>" + "<script>noop()</script>").repeat(1000);
  const html = buildLogHtml(payload, "body{}");

  assert.match(html, /<html><head>/);
  assert.match(html, /<title>Web Client Buffer<\/title>/);
  assert.match(html, /\u3053\u3093\u306b\u3061\u306f/);
  assert.match(html, /red/);
  assert.match(html, /<div id="lineBuffer">/);
  assert.match(html, /<\/div><\/div><\/body><\/html>/);
  assert.ok(html.length > 40000);
});

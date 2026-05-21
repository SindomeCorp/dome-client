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

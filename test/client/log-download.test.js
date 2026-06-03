import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLogDownloadFilename,
  buildLogDownloadHtml,
  formatLogTimestamp,
  resolveLogBaseName,
  sanitizeLogBaseName
} from "../../src/client/features/terminal/log-download.js";

test("formatLogTimestamp uses log filename timestamp format", () => {
  assert.equal(formatLogTimestamp(new Date(2026, 0, 2, 0, 5)), "01_02_2026_1205am");
  assert.equal(formatLogTimestamp(new Date(2026, 10, 12, 13, 7)), "11_12_2026_107pm");
});

test("log download filename sanitizes game names and supports multi-mud prefix", () => {
  const now = new Date(2026, 5, 2, 15, 42);

  assert.equal(sanitizeLogBaseName(" My MOO!! "), "my-moo");
  assert.equal(resolveLogBaseName({ isMultiMud: false, gameName: " The Grid " }), "the-grid");
  assert.equal(resolveLogBaseName({ isMultiMud: true, gameName: "ignored" }), "dome-client");
  assert.equal(
    buildLogDownloadFilename({ now, isMultiMud: false, gameName: "The Grid" }),
    "the-grid.log.06_02_2026_342pm.html"
  );
  assert.equal(
    buildLogDownloadFilename({ now, isMultiMud: true, gameName: "The Grid" }),
    "dome-client.log.06_02_2026_342pm.html"
  );
});

test("buildLogDownloadHtml delegates to inline log template", () => {
  const html = buildLogDownloadHtml({
    bufferHtml: "<p>log</p>",
    logExportCss: "body { color: white; }",
    inlineLogCss: true
  });

  assert.match(html, /<style>body \{ color: white; \}<\/style>/);
  assert.match(html, /<p>log<\/p>/);
});

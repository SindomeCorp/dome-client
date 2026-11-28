import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

let revision = 0;
async function loadStyle(t, readFileSync) {
  const warn = t.mock.fn();
  const named = t.mock.fn(() => ({ warn }));
  const fs = t.mock.module("node:fs", { defaultExport: { readFileSync } });
  const logger = t.mock.module("../../src/logger.js", { namedExports: { named } });
  try {
    const { getLogExportCss } = await import(`../../src/services/log-export-style.js?fixture=${revision++}`);
    return { getLogExportCss, named, warn };
  } finally {
    fs.restore();
    logger.restore();
  }
}

test("standalone logs embed the compiled CSS with local font fallbacks and cache it", async (t) => {
  const read = t.mock.fn(() => [
    "p{font-family: 'Source Code Pro'}",
    "pre{font-family:\"Roboto Mono\"}",
    "code{font-family: Comic Mono}",
    "h1{font-family:'Quantico'}",
    "h2{font-family:serif}"
  ].join("\n"));
  const { getLogExportCss, named, warn } = await loadStyle(t, read);
  const fonts = getLogExportCss();
  for (const name of ["Source Code Pro", "Roboto Mono", "Comic Mono"]) {
    assert.ok(fonts.includes(`font-family:'${name}','Liberation Mono','DejaVu Sans Mono',monospace`));
  }
  assert.ok(fonts.includes("font-family:'Quantico','Helvetica Neue',Helvetica,Arial,sans-serif"));
  assert.ok(fonts.includes("h2{font-family:serif}"));
  assert.equal(getLogExportCss(), fonts);
  assert.equal(read.mock.callCount(), 1);
  assert.deepEqual(read.mock.calls[0].arguments, [
    path.resolve("public/css/client.css"), "utf8"
  ]);
  assert.deepEqual(named.mock.calls[0].arguments, ["services/log-export-style"]);
  assert.equal(warn.mock.callCount(), 0);
});

test("standalone logs try legacy CSS when the compiled stylesheet is missing", async (t) => {
  const read = t.mock.fn((file) => {
    if (file === path.resolve("public/css/client.css")) {
      throw Object.assign(new Error("missing fixture"), { code: "ENOENT" });
    }
    return "body{color: black}";
  });
  const { getLogExportCss, warn } = await loadStyle(t, read);

  assert.equal(getLogExportCss(), "body{color: black}");
  assert.deepEqual(read.mock.calls[1].arguments, [path.resolve("public/legacy/client.css"), "utf8"]);
  assert.equal(warn.mock.callCount(), 0);
});

test("standalone logs warn about unreadable CSS and cache the empty fallback", async (t) => {
  const failure = Object.assign(new Error("fixture denied"), { code: "EACCES" });
  const read = t.mock.fn(() => { throw failure; });
  const { getLogExportCss, warn } = await loadStyle(t, read);

  assert.equal(getLogExportCss(), "");
  assert.equal(getLogExportCss(), "");
  assert.equal(read.mock.callCount(), 2);
  assert.deepEqual(warn.mock.calls[0].arguments, [
    "Unable to read log export css from " + path.resolve("public/css/client.css"), failure
  ]);
  assert.deepEqual(warn.mock.calls[2].arguments, ["No log export css found in expected locations."]);
});

test("font fallbacks apply to compact, spaced, quoted and unquoted CSS", async (t) => {
  const fonts = [
    ["Source Code Pro", "'Liberation Mono','DejaVu Sans Mono',monospace"],
    ["Roboto Mono", "'Liberation Mono','DejaVu Sans Mono',monospace"],
    ["Comic Mono", "'Liberation Mono','DejaVu Sans Mono',monospace"],
    ["Quantico", "'Helvetica Neue',Helvetica,Arial,sans-serif"]
  ];
  const rules = fonts.flatMap(([font, fallbacks]) => ["", "  "].flatMap(space =>
    ["", "'", "\""].map(quote => ({
      input: `p{font-family:${space}${quote}${font}${quote};color:red}`,
      output: `p{font-family:'${font}',${fallbacks};color:red}`
    }))));
  const { getLogExportCss } = await loadStyle(t, () => rules.map(({ input }) => input).join("\n"));

  assert.equal(getLogExportCss(), rules.map(({ output }) => output).join("\n"));
});

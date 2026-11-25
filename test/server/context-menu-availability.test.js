import { referenceContextMenus } from "../../test-support/context-menu-reference-fixture.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getContextMenuAvailability } from "../../src/services/context-menu-profiles.js";
import { defaultContextMenus } from "../../src/shared/context-menus.js";
import { build } from "esbuild";
import { readFileSync } from "node:fs";

function fixture(readFile, enabled = true) {
  const errors = [];
  const warnings = [];
  const availability = getContextMenuAvailability({ enabled, readFile, logger: { error: (text) => errors.push(text), warn: (text) => warnings.push(text) } });
  return { availability, errors, warnings };
}

test("context menus default enabled with the actual registered files", () => {
  assert.deepEqual(fixture().availability, { enabled: true });
  assert.deepEqual(defaultContextMenus(), JSON.parse(readFileSync(new URL("../../data/profiles/player.json", import.meta.url), "utf8")));
});

test("the real browser entry and matching worker build independently of missing or invalid profile JSON", async () => {
  const result = await build({
    entryPoints: ["src/client/entrypoints/index.js", "src/client/entrypoints/context-menus-worker.js"],
    bundle: true, write: false, outdir: "/unused", metafile: true,
    plugins: [{ name: "no-profile-files", setup(builder) {
      builder.onResolve({ filter: /profiles\/.*\.json$/ }, () => ({ errors: [{ text: "Profile unavailable in this fixture" }] }));
    } }]
  });
  assert.equal(result.outputFiles.length, 2);
  assert.ok(!Object.keys(result.metafile.inputs).some((path) => path.includes("data/profiles/")));
});

test("context menus disabled by ENV skip all file reads and warnings", () => {
  const result = fixture(() => { throw new Error("must not read"); }, false);
  assert.deepEqual(result, { availability: { enabled: false }, errors: [], warnings: [] });
});

test("no usable files disables context menus and logs actionable errors", async (t) => {
  for (const [name, readFile] of Object.entries({
    missing: () => { throw new Error("ENOENT synthetic missing file"); },
    malformed: () => "{",
    invalid: () => JSON.stringify({ version: 99 }),
    oversized: () => " ".repeat(262145),
    mismatched: () => JSON.stringify({ version: 1, rules: [], profiles: [] }),
    empty: (path) => JSON.stringify({ version: 1, rules: [], profiles: [{ id: path.pathname.split("/").pop().replace(".json", ""), label: "Empty", rules: [] }] }),
    regex: () => { const config = referenceContextMenus(); config.rules[0].pattern = "["; return JSON.stringify(config); }
  })) await t.test(name, () => {
    const result = fixture(readFile);
    assert.deepEqual(result.availability, { enabled: false });
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /Context menus disabled: no usable registered JSON profile files/);
    for (const id of ["player", "gm", "programmer"]) assert.ok(result.errors[0].includes(id + ":"));
  });
});

test("one valid registered file keeps the feature available and warns about the others", () => {
  const paths = [];
  const result = fixture((path) => {
    paths.push(path.pathname);
    return JSON.stringify(defaultContextMenus());
  });
  assert.equal(result.availability.enabled, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /gm: Expected registered profile ID gm/);
  assert.equal(paths.length, 3);
  assert.ok(paths.every((path) => /\/data\/profiles\/(player|gm|programmer)\.json$/.test(path)));
});

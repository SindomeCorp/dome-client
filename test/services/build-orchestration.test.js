import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import less from "less";
import build from "../../src/services/build.js";
import { browserOutputFiles } from "../../src/services/browser-entry-manifest.js";

test("the real asset build preserves the served release on failure and publishes a complete retry", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dome-assets-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "public");
  const js = path.join(output, "js");
  const css = path.join(output, "css");
  await fs.mkdir(js, { recursive: true });
  await fs.mkdir(css, { recursive: true });
  const bundle = path.join(js, "player-client.js");
  await fs.writeFile(bundle, "previous release");
  await fs.writeFile(path.join(js, "custom.js"), "custom script");
  await fs.writeFile(path.join(css, "custom.css"), "custom static asset");

  const failure = t.mock.method(less, "render", async () => { throw new Error("synthetic stylesheet error"); });
  await assert.rejects(build({ output }), (error) => {
    assert.match(error.message, /Asset compilation failed/);
    assert.equal(error.errors[0].message, "synthetic stylesheet error");
    return true;
  });
  failure.mock.restore();
  assert.equal(await fs.readFile(bundle, "utf8"), "previous release");
  assert.deepEqual(await fs.readdir(directory), ["public"]);

  const rename = fs.rename.bind(fs);
  const publicationFailure = t.mock.method(fs, "rename", async (source, target) => {
    if (target === path.join(css, "ide.css")) throw new Error("synthetic publication error");
    return rename(source, target);
  });
  await assert.rejects(build({ output }), /synthetic publication error/);
  publicationFailure.mock.restore();
  assert.equal(await fs.readFile(bundle, "utf8"), "previous release");
  assert.deepEqual(await fs.readdir(js), ["custom.js", "player-client.js"]);
  assert.deepEqual(await fs.readdir(directory), ["public"]);

  await build({ output });
  for (const asset of [
    ...browserOutputFiles.map((name) => "js/" + name),
    "js/master-header.js", "js/parsers/web-tree-sitter.wasm", "js/ace/ace.js",
    "css/client.css", "css/ide.css"
  ]) assert.ok((await fs.stat(path.join(output, asset))).size > 0, asset);
  const ideCss = await fs.readFile(path.join(css, "ide.css"), "utf8");
  assert.match(ideCss, /tailwindcss v4/);
  assert.doesNotMatch(ideCss, /@import "tailwindcss"/);
  assert.notEqual(await fs.readFile(bundle, "utf8"), "previous release");
  assert.equal(await fs.readFile(path.join(css, "custom.css"), "utf8"), "custom static asset");
  assert.equal(await fs.readFile(path.join(js, "custom.js"), "utf8"), "custom script");
});

test("a failed asset rollback preserves the last good backup and both errors", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dome-assets-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "public");
  const css = path.join(output, "css");
  const client = path.join(css, "client.css");
  await fs.mkdir(css, { recursive: true });
  await fs.writeFile(client, "previous stylesheet");

  const publishError = new Error("fixture publication failure");
  const rollbackError = new Error("fixture restoration failure");
  const rename = fs.rename.bind(fs);
  let backup;
  t.mock.method(fs, "rename", (source, target) => {
    if (source === client) backup = target;
    if (target === path.join(css, "ide.css")) throw publishError;
    if (source === backup) throw rollbackError;
    return rename(source, target);
  });

  await assert.rejects(build({ output }), (error) => {
    assert.match(error.message, /Asset rollback failed/);
    assert.deepEqual(error.errors, [publishError, rollbackError]);
    assert.equal(error.cause, publishError);
    return true;
  });
  assert.equal(await fs.readFile(backup, "utf8"), "previous stylesheet");
});

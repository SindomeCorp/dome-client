/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import less from "less";
import * as buildModule from "../../src/services/build.js";
import { fileURLToPath } from "node:url";

const serviceDir = path.dirname(fileURLToPath(new URL("../../src/services/build.js", import.meta.url)));
const realLessDir = path.join(serviceDir, "..", "..", "less");
const realCssDir = path.join(serviceDir, "..", "..", "public", "css");

test("cleanDir removes filtered files and ignores missing directories", async t => {
  t.mock.method(fs, "readdir", async dir => {
    if (dir === "/exists") return ["keep.txt", "remove.tmp"];
    throw Object.assign(new Error("not found"), { code: "ENOENT" });
  });
  const rm = t.mock.method(fs, "rm", async () => {});
  await buildModule.cleanDir("/exists", f => f.endsWith(".tmp"));
  assert.deepStrictEqual(rm.mock.calls.map(c => c.arguments[0]), [path.join("/exists", "remove.tmp")]);
  await buildModule.cleanDir("/missing", () => true);
  assert.strictEqual(rm.mock.calls.length, 1);
});

test("cleanDir propagates removal errors", async t => {
  t.mock.method(fs, "readdir", async () => ["bad.tmp"]);
  const rm = t.mock.method(fs, "rm", async () => { throw new Error("rmfail"); });
  await buildModule.cleanDir("/dir", f => f.endsWith(".tmp"));
  assert.strictEqual(rm.mock.calls.length, 1);
});

test("compileLess generates CSS for each .less file", async t => {
  t.mock.method(fs, "mkdir", async () => {});
  t.mock.method(fs, "readdir", async dir => dir === realCssDir ? ["client.css"] : []);
  const rm = t.mock.method(fs, "rm", async () => {});
  t.mock.method(fs, "readFile", async file => {
    if (file.startsWith(realLessDir)) return `data:${path.basename(file)}`;
    throw new Error(`unexpected read ${file}`);
  });
  const writeFile = t.mock.method(fs, "writeFile", async () => {});
  t.mock.method(less, "render", async (content, { filename }) => ({ css: `css:${path.basename(filename)}` }));
  await buildModule.compileLess();
  const written = writeFile.mock.calls.map(c => [path.basename(c.arguments[0]), c.arguments[1]]);
  assert.deepStrictEqual(written, [
    ["client.css", "css:client.less"]
  ]);
  const removed = rm.mock.calls.map(c => path.basename(c.arguments[0]));
  assert.deepStrictEqual(removed, ["client.css"]);
});

test("compileLess rejects when mkdir fails", async t => {
  t.mock.method(fs, "mkdir", async () => { throw new Error("mkdirfail"); });
  await assert.rejects(() => buildModule.compileLess(), /mkdirfail/);
});

test("compileLess rejects when render fails", async t => {
  t.mock.method(fs, "mkdir", async () => {});
  t.mock.method(fs, "readdir", async () => []);
  t.mock.method(fs, "readFile", async () => "data");
  t.mock.method(less, "render", async () => { throw new Error("renderfail"); });
  await assert.rejects(() => buildModule.compileLess(), /renderfail/);
});

test("compileJs bundles entry and produces normal and minified outputs", async t => {
  t.mock.method(fs, "mkdir", async () => {});
  const rm = t.mock.method(fs, "rm", async () => {});
  const built = [];
  t.mock.module("esbuild", { default: {} });
  const { default: esbuild } = await import("esbuild");
  esbuild.build = async args => {
    built.push(path.basename(args.outfile));
    await fs.writeFile(args.outfile, "placeholder", "utf8");
  };
  const { compileJs } = await import(`../../src/services/build.js?mock=${Date.now()}`);
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "js-"));
  await compileJs(outDir);
  const expected = [
    "player-client.js",
    "player-client.min.js",
    "client-connect.js",
    "client-options.js",
    "editor-window.js",
    "note-editor-window.js",
    "logger.js",
    "ide-editor-window.js"
  ];
  assert.deepStrictEqual(built.sort(), expected.slice().sort());
  for (const file of expected) {
    const content = await fs.readFile(path.join(outDir, file), "utf8");
    assert.strictEqual(content, "placeholder");
  }
  const removed = rm.mock.calls.map(c => path.basename(c.arguments[0])).sort();
  assert.deepStrictEqual(removed, [
    "client-connect.js",
    "client-options.js",
    "editor-window.js",
    "logger.js",
    "note-editor-window.js",
    "player-client.js",
    "player-client.min.js"
  ].sort());
});

test("compileJs rejects when cleanup fails", async t => {
  t.mock.method(fs, "mkdir", async () => {});
  t.mock.method(fs, "rm", async () => { throw new Error("rmfail"); });
  t.mock.module("esbuild", { default: {} });
  const { default: esbuild } = await import("esbuild");
  esbuild.build = async args => {
    await fs.writeFile(args.outfile, "placeholder", "utf8");
  };
  const { compileJs } = await import(`../../src/services/build.js?mock=${Date.now()}`);
  await assert.rejects(() => compileJs("/out"), /rmfail/);
});

test("copyAce copies ace-builds assets to destination", async t => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "ace-"));
  const cp = t.mock.method(fs, "cp", async (src, dest) => {
    await fs.writeFile(path.join(dest, "ace.js"), "// placeholder");
  });
  await buildModule.copyAce(outDir);
  const aceSrcDir = path.join(
    serviceDir,
    "..",
    "..",
    "node_modules",
    "ace-builds",
    "src-min-noconflict"
  );
  assert.deepStrictEqual(cp.mock.calls[0].arguments, [aceSrcDir, outDir, { recursive: true }]);
  const files = await fs.readdir(outDir);
  assert.deepStrictEqual(files, ["ace.js"]);
  const content = await fs.readFile(path.join(outDir, "ace.js"), "utf8");
  assert.strictEqual(content, "// placeholder");
});

test("build executes only once", async t => {
  t.mock.method(fs, "mkdir", async () => {});
  t.mock.method(fs, "readdir", async dir => dir === realCssDir ? [] : []);
  const rm = t.mock.method(fs, "rm", async () => {});
  t.mock.method(fs, "cp", async () => {});
  t.mock.method(fs, "readFile", async () => "body{}" );
  t.mock.method(fs, "writeFile", async () => {});
  t.mock.method(less, "render", async () => ({ css: "" }));
  t.mock.module("esbuild", { default: {} });
  const { default: esbuild } = await import("esbuild");
  esbuild.build = async () => {};
  const { default: build } = await import(`../../src/services/build.js?mock=${Date.now()}`);
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "js-"));
  const first = build({ jsOutDir: outDir });
  const second = build({ jsOutDir: outDir });
  assert.strictEqual(first, second);
  await first;
  const calls = rm.mock.calls.length;
  await build({ jsOutDir: outDir });
  assert.strictEqual(rm.mock.calls.length, calls);
});

test("build rejects when a step fails and memoizes the error", async t => {
  t.mock.method(fs, "mkdir", async () => {});
  t.mock.method(fs, "readdir", async () => []);
  t.mock.method(fs, "rm", async () => {});
  t.mock.method(fs, "cp", async () => {});
  t.mock.method(fs, "readFile", async () => { throw new Error("boom"); });
  t.mock.method(fs, "writeFile", async () => {});
  t.mock.method(less, "render", async () => ({ css: "" }));
  t.mock.module("esbuild", { default: {} });
  const { default: esbuild } = await import("esbuild");
  esbuild.build = async () => {};
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "js-"));
  const mod = await import(`../../src/services/build.js?fail=${Date.now()}`);
  const first = mod.default({ jsOutDir: outDir });
  const second = mod.default({ jsOutDir: outDir });
  assert.strictEqual(first, second);
  await assert.rejects(() => first, /boom/);
});


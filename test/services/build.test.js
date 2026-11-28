/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import less from "less";
import * as buildModule from "../../src/services/build.js";
import { browserOutputFiles, pageEntries, playerClientEntries } from "../../src/services/browser-entry-manifest.js";
import { fileURLToPath } from "node:url";
import { setImmediate } from "node:timers/promises";

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

test("compileLess generates the requested client stylesheet without source warnings", async t => {
  const warn = t.mock.method(globalThis.console, "warn", () => {});
  const mkdir = t.mock.method(fs, "mkdir", async () => {});
  t.mock.method(fs, "readdir", async dir => dir === realCssDir ? ["client.css", "ide.css", "custom.css"] : []);
  const rm = t.mock.method(fs, "rm", async () => {});
  t.mock.method(fs, "readFile", async file => {
    if (file.startsWith(realLessDir)) return `data:${path.basename(file)}`;
    throw new Error(`unexpected read ${file}`);
  });
  const writeFile = t.mock.method(fs, "writeFile", async () => {});
  t.mock.method(less, "render", async (content, { filename }) => ({ css: `css:${path.basename(filename)}` }));
  await buildModule.compileLess();
  assert.deepEqual(mkdir.mock.calls[0].arguments, [realCssDir, { recursive: true }]);
  const written = writeFile.mock.calls.map(c => [path.basename(c.arguments[0]), c.arguments[1]]);
  assert.deepStrictEqual(written, [
    ["client.css", "css:client.less"]
  ]);
  const removed = rm.mock.calls.map(c => path.basename(c.arguments[0]));
  assert.deepStrictEqual(removed, ["client.css"]);
  assert.ok(!warn.mock.calls.some(({ arguments: [message] }) => /Without `from` option PostCSS/.test(message)));
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
    built.push(args);
    await fs.writeFile(args.outfile, "placeholder", "utf8");
  };
  const { compileJs } = await import(`../../src/services/build.js?mock=${Date.now()}`);
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "js-"));
  await compileJs(outDir);
  const expected = [
    "context-menus-worker.js",
    "output-window.js",
    "output-rules-worker.js",
    "player-client.js",
    "player-client.min.js",
    "client-connect.js",
    "client-options.js",
    "editor-window.js",
    "note-editor-window.js",
    "logger.js",
    "ide-editor-window.js",
    "moo-parser-worker.js"
  ];
  assert.deepEqual(built.map(({ outfile }) => path.basename(outfile)).sort(), expected.slice().sort());
  for (const options of built) {
    const file = path.basename(options.outfile);
    assert.equal(options.bundle, true, file);
    assert.equal(options.format, file.startsWith("player-client") ? "iife" : "esm", file);
    if (file.startsWith("player-client")) assert.equal(options.minify, file.endsWith(".min.js"), file);
  }
  for (const file of expected) {
    const content = await fs.readFile(path.join(outDir, file), "utf8");
    assert.strictEqual(content, "placeholder");
  }
  const removed = rm.mock.calls.map(c => path.basename(c.arguments[0])).sort();
  assert.deepStrictEqual(removed, [
    "context-menus-worker.js",
    "output-window.js",
    "output-rules-worker.js",
    "client-connect.js",
    "client-options.js",
    "editor-window.js",
    "ide-editor-window.js",
    "logger.js",
    "moo-parser-worker.js",
    "note-editor-window.js",
    "player-client.js",
    "player-client.min.js"
  ].sort());
});

test("browser entry manifest declares expected output files once", () => {
  const expected = [
    "player-client.js",
    "player-client.min.js",
    "context-menus-worker.js",
    "output-window.js",
    "output-rules-worker.js",
    "client-connect.js",
    "client-options.js",
    "editor-window.js",
    "note-editor-window.js",
    "logger.js",
    "ide-editor-window.js",
    "moo-parser-worker.js"
  ];

  assert.deepStrictEqual(browserOutputFiles, expected);
  assert.deepEqual(playerClientEntries, [
    { entry: "index.js", file: "player-client.js", format: "iife", minify: false },
    { entry: "index.js", file: "player-client.min.js", format: "iife", minify: true }
  ]);
  assert.deepStrictEqual(pageEntries.map(({ file }) => file), expected.slice(2));
  const externalByPage = {
    "client-connect.js": ["./logger.js"],
    "client-options.js": ["./logger.js"],
    "editor-window.js": ["./logger.js"],
    "ide-editor-window.js": ["./logger.js"],
    "moo-parser-worker.js": ["/js/parsers/web-tree-sitter.js"]
  };
  for (const { file, entry, external } of pageEntries) {
    assert.equal(entry, file === "ide-editor-window.js" ? "ide-editor-window.jsx" : file);
    assert.deepEqual(external, externalByPage[file] ?? []);
  }
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
  const mkdir = t.mock.method(fs, "mkdir");
  const cp = t.mock.method(fs, "cp", async (src, dest) => {
    await fs.writeFile(path.join(dest, "ace.js"), "// placeholder");
  });
  await buildModule.copyAce(outDir);
  const aceSrcDir = path.dirname(fileURLToPath(import.meta.resolve("ace-builds/src-min-noconflict/ace.js")));
  assert.deepStrictEqual(cp.mock.calls[0].arguments, [aceSrcDir, outDir, { recursive: true }]);
  assert.deepEqual(mkdir.mock.calls[0].arguments, [outDir, { recursive: true }]);
  const files = await fs.readdir(outDir);
  assert.deepStrictEqual(files, ["ace.js"]);
  const content = await fs.readFile(path.join(outDir, "ace.js"), "utf8");
  assert.strictEqual(content, "// placeholder");
});

test("copyMooParserWasm copies packaged tree-sitter-moo wasm", async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "moo-parser-"));
  await buildModule.copyMooParserWasm(outDir);

  const copiedMoo = await fs.readFile(path.join(outDir, "tree-sitter-moo.wasm"));
  const sourceMoo = await fs.readFile(fileURLToPath(import.meta.resolve("tree-sitter-moo/wasm")));
  assert.deepStrictEqual(copiedMoo, sourceMoo);

  const copiedRuntime = await fs.readFile(path.join(outDir, "web-tree-sitter.wasm"));
  const sourceRuntime = await fs.readFile(fileURLToPath(import.meta.resolve("web-tree-sitter/web-tree-sitter.wasm")));
  assert.deepStrictEqual(copiedRuntime, sourceRuntime);

  const copiedRuntimeJs = await fs.readFile(path.join(outDir, "web-tree-sitter.js"), "utf8");
  const sourceRuntimeJs = await fs.readFile(
    path.join(path.dirname(fileURLToPath(import.meta.resolve("web-tree-sitter/web-tree-sitter.wasm"))), "web-tree-sitter.js"),
    "utf8"
  );
  assert.deepStrictEqual(copiedRuntimeJs, sourceRuntimeJs);
});

test("IDE CSS errors preserve the original cause", async (t) => {
  const failure = new Error("fixture stylesheet read failure");
  t.mock.method(fs, "mkdir", async () => {});
  t.mock.method(fs, "readFile", async () => { throw failure; });

  await assert.rejects(buildModule.compileReactCss("/unused/css"), (error) => {
    assert.equal(error.message, "Could not compile IDE CSS");
    assert.equal(error.cause, failure);
    return true;
  });
});

test("build shares a pending default build and permits retry after failure", async (t) => {
  const failure = new Error("fixture asset directory failure");
  const mkdir = t.mock.method(fs, "mkdir", async () => { throw failure; });
  const { default: build } = buildModule;
  const first = build();
  const same = build();
  const results = await Promise.allSettled([first, same]);

  assert.equal(first, same);
  assert.equal(mkdir.mock.callCount(), 1);
  assert.deepEqual(results, [
    { status: "rejected", reason: failure },
    { status: "rejected", reason: failure }
  ]);
  const retry = build();
  await assert.rejects(retry, (error) => error === failure);
  assert.notEqual(retry, first);
  assert.equal(mkdir.mock.callCount(), 2);
});

test("EJS entries compile as modules, preserve the options import, and ignore other files", async (t) => {
  t.mock.method(fs, "mkdir", async () => {});
  t.mock.method(fs, "readdir", async () => ["master-header.js", "guide.txt"]);
  const rm = t.mock.method(fs, "rm", async () => {});
  const build = t.mock.fn(async () => {});
  const esbuild = t.mock.module("esbuild", { defaultExport: { build } });
  const { compileEjsScripts } = await import("../../src/services/build.js?ejs-options-fixture");
  esbuild.restore();

  const output = path.resolve("unused-ejs");
  await compileEjsScripts(output);

  assert.deepEqual(rm.mock.calls.map(c => c.arguments[0]), [path.join(output, "master-header.js")]);
  assert.equal(build.mock.callCount(), 1);
  const [options] = build.mock.calls[0].arguments;
  assert.equal(path.basename(options.entryPoints[0]), "master-header.js");
  assert.equal(options.outfile, path.join(output, "master-header.js"));
  assert.equal(options.format, "esm");
  assert.deepEqual(options.external, ["./client-options.js"]);
});

test("EJS compilation tolerates a missing optional source directory and reports other read errors", async (t) => {
  t.mock.method(fs, "mkdir", async () => {});
  const missing = Object.assign(new Error("fixture source absent"), { code: "ENOENT" });
  const denied = Object.assign(new Error("fixture source unreadable"), { code: "EACCES" });
  let failure = missing;
  t.mock.method(fs, "readdir", async () => { throw failure; });

  await buildModule.compileEjsScripts("/unused/js");
  failure = denied;
  await assert.rejects(buildModule.compileEjsScripts("/unused/js"), (error) => error === denied);
});

test("EJS reports a missing dependency in an existing entry", async (t) => {
  const failure = Object.assign(new Error("fixture build dependency absent"), { code: "ENOENT" });
  t.mock.method(fs, "readdir", async () => ["master-header.js"]);
  t.mock.method(fs, "rm", async () => {});
  const esbuild = t.mock.module("esbuild", { defaultExport: { build: async () => { throw failure; } } });
  const { compileEjsScripts } = await import("../../src/services/build.js?missing-entry-dependency");
  esbuild.restore();

  await assert.rejects(compileEjsScripts("/unused/js"), (error) => error === failure);
});

test("the direct asset build entry reports a failure and sets a failure exit code", async (t) => {
  const failure = new Error("fixture asset build failed");
  t.mock.method(fs, "mkdir", async () => { throw failure; });
  const error = t.mock.fn();
  const named = t.mock.fn(() => ({ error }));
  const logger = t.mock.module("../../src/logger.js", { namedExports: { named } });
  const previousArg = process.argv[1];
  const previousExitCode = process.exitCode;
  t.after(() => {
    process.argv[1] = previousArg;
    process.exitCode = previousExitCode;
  });
  process.argv[1] = fileURLToPath(new URL("../../src/services/build.js", import.meta.url));

  await import("../../src/services/build.js?direct-entry-fixture");
  logger.restore();
  await setImmediate();

  assert.deepEqual(named.mock.calls[0].arguments, ["build"]);
  assert.deepEqual(error.mock.calls[0].arguments, ["Asset build failed", failure]);
  assert.equal(process.exitCode, 1);
});

test("concurrent builds for different output directories remain independent", async (t) => {
  const firstOutput = "/unused/first";
  const secondOutput = "/unused/second";
  const firstFailure = new Error("first fixture output");
  const secondFailure = new Error("second fixture output");
  const mkdir = t.mock.method(fs, "mkdir", async (dir) => {
    throw dir === firstOutput ? firstFailure : secondFailure;
  });
  const { default: build } = buildModule;

  assert.deepEqual(await Promise.allSettled([
    build({ output: firstOutput }),
    build({ output: secondOutput })
  ]), [
    { status: "rejected", reason: firstFailure },
    { status: "rejected", reason: secondFailure }
  ]);
  assert.deepEqual(mkdir.mock.calls.map(({ arguments: [dir] }) => dir), [firstOutput, secondOutput]);
});

test("standalone asset helpers default to the corresponding public directories", async (t) => {
  const failure = new Error("fixture blocks the default destination before writing");
  const mkdir = t.mock.method(fs, "mkdir", async () => { throw failure; });
  t.mock.method(fs, "rm", async () => {});
  for (const helper of [buildModule.compileReactCss, buildModule.compileJs, buildModule.copyAce, buildModule.copyMooParserWasm]) {
    await assert.rejects(helper(), error => error === failure);
  }
  const publicRoot = path.dirname(realCssDir);
  assert.deepEqual(mkdir.mock.calls.map(({ arguments: [directory] }) => directory), [
    realCssDir, path.join(publicRoot, "js"), path.join(publicRoot, "js", "ace"), path.join(publicRoot, "js", "parsers")
  ]);
});

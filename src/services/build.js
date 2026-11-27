import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import less from "less";
import esbuild from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { named } from "../logger.js";

import { fileURLToPath } from "node:url";
import {
  browserOutputFiles,
  pageEntries,
  playerClientEntries
} from "./browser-entry-manifest.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);

const publicDir = path.join(__dirname, "../../public");
let buildPromise;

async function cleanDir(dir, filter) {
  try {
    const files = await fs.readdir(dir);
    await Promise.all(files.filter(filter).map(f => fs.rm(path.join(dir, f))));
  } catch {
    // ignore if directory doesn't exist
  }
}

async function compileLess(outDir = path.join(publicDir, "css")) {
  const srcDir = path.join(__dirname, "..", "..", "less");
  const files = ["client.less"];
  const outFiles = files.map(f => f.replace(/\.less$/, ".css"));
  await fs.mkdir(outDir, { recursive: true });
  await cleanDir(outDir, f => outFiles.includes(f));
  for (const file of files) {
    const full = path.join(srcDir, file);
    const data = await fs.readFile(full, "utf8");
    const output = await less.render(data, { filename: full });
    let plugins;
    if (typeof postcss.loadConfig === "function") {
      ({ plugins } = await postcss.loadConfig());
    } else {
      const configModule = await import(new URL("../../postcss.config.js", import.meta.url));
      plugins = configModule.default?.plugins ?? [];
    }
    const prefixed = await postcss(plugins).process(output.css, { from: undefined });
    const cssName = file.replace(/\.less$/, ".css");
    await fs.writeFile(path.join(outDir, cssName), prefixed.css, "utf8");
  }
}

async function compileReactCss(outDir = path.join(publicDir, "css")) {
  const srcFile = path.join(__dirname, "..", "client", "features", "editor", "react", "ide.css");
  await fs.mkdir(outDir, { recursive: true });
  try {
    const data = await fs.readFile(srcFile, "utf8");
    const result = await postcss([tailwindcss()]).process(data, {
      from: srcFile
    });
    await fs.writeFile(path.join(outDir, "ide.css"), result.css, "utf8");
  } catch (err) {
    throw new Error("Could not compile IDE CSS", { cause: err });
  }
}

async function compileJs(outDir = path.join(__dirname, "..", "..", "public", "js")) {
  const srcDir = path.join(__dirname, "..", "client", "entrypoints");
  await fs.mkdir(outDir, { recursive: true });
  await Promise.all(browserOutputFiles.map(f => fs.rm(path.join(outDir, f), { force: true })));
  for (const { entry, file, format, minify } of playerClientEntries) {
    await esbuild.build({
      bundle: true,
      entryPoints: [path.join(srcDir, entry)],
      format,
      minify,
      outfile: path.join(outDir, file)
    });
  }
  for (const { file, entry, external } of pageEntries) {
    await esbuild.build({
      bundle: true,
      entryPoints: [path.join(srcDir, entry)],
      format: "esm",
      external,
      outfile: path.join(outDir, file)
    });
  }
}

async function compileEjsScripts(outDir = path.join(__dirname, "..", "..", "public", "js")) {
  const srcDir = path.join(__dirname, "..", "client", "entrypoints", "ejs-scripts");
  try {
    const files = (await fs.readdir(srcDir)).filter(f => f.endsWith(".js"));
    await Promise.all(files.map(f => fs.rm(path.join(outDir, f), { force: true })));
    await Promise.all(
      files.map(file =>
        esbuild.build({
          bundle: true,
          entryPoints: [path.join(srcDir, file)],
          format: "esm",
          external: ["./client-options.js"],
          outfile: path.join(outDir, file)
        })
      )
    );
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
}

async function copyAce(outDir = path.join(__dirname, "..", "..", "public", "js", "ace")) {
  const srcDir = path.dirname(require.resolve("ace-builds/src-min-noconflict/ace.js"));
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.cp(srcDir, outDir, { recursive: true });
}

async function copyMooParserWasm(outDir = path.join(__dirname, "..", "..", "public", "js", "parsers")) {
  const mooWasm = require.resolve("tree-sitter-moo/wasm");
  const runtimeWasm = require.resolve("web-tree-sitter/web-tree-sitter.wasm");
  const runtimeJs = path.join(path.dirname(runtimeWasm), "web-tree-sitter.js");
  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    fs.copyFile(mooWasm, path.join(outDir, "tree-sitter-moo.wasm")),
    fs.copyFile(runtimeJs, path.join(outDir, "web-tree-sitter.js")),
    fs.copyFile(runtimeWasm, path.join(outDir, "web-tree-sitter.wasm"))
  ]);
}

export {
  cleanDir,
  compileLess,
  compileReactCss,
  compileJs,
  compileEjsScripts,
  copyAce,
  copyMooParserWasm
};

// Compilation never writes to the served tree. Keep backups until every
// generated destination has been published so a failed publication can roll back.
async function publishAssets(output, stage, scratch) {
  const published = [];
  try {
    await fs.mkdir(path.join(output, "css"), { recursive: true });
    await fs.mkdir(path.join(output, "js"), { recursive: true });
    const bundles = await fs.readdir(path.join(stage, "js"));
    for (const name of [...bundles.map((name) => "js/" + name), "css/client.css", "css/ide.css"]) {
      const target = path.join(output, name);
      const backup = path.join(scratch, published.length + ".previous");
      let hadPrevious = true;
      try { await fs.rename(target, backup); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        hadPrevious = false;
      }
      const entry = { target, backup, hadPrevious, installed: false };
      published.push(entry);
      await fs.rename(path.join(stage, name), target);
      entry.installed = true;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of published.reverse()) {
      try {
        if (entry.installed) await fs.rm(entry.target, { recursive: true, force: true });
        if (entry.hadPrevious) await fs.rename(entry.backup, entry.target);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Asset rollback failed; backups remain at " + scratch, { cause: error });
    throw error;
  }
}

async function buildAssets(output) {
  await fs.mkdir(output, { recursive: true });
  const scratch = await fs.mkdtemp(path.join(path.dirname(output), ".dome-assets-"));
  const stage = path.join(scratch, "stage");
  const css = path.join(stage, "css");
  const js = path.join(stage, "js");
  let keepBackups = false;
  try {
    await fs.mkdir(js, { recursive: true });
    const results = await Promise.allSettled([
      compileLess(css),
      compileReactCss(css),
      compileJs(js),
      compileEjsScripts(js),
      copyAce(path.join(js, "ace")),
      copyMooParserWasm(path.join(js, "parsers"))
    ]);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(({ reason }) => reason), "Asset compilation failed");
    try { await publishAssets(output, stage, scratch); }
    catch (error) {
      keepBackups = error instanceof AggregateError;
      throw error;
    }
  } finally {
    if (!keepBackups) await fs.rm(scratch, { recursive: true, force: true });
  }
}

export default function build({ output = publicDir } = {}) {
  if (output !== publicDir) return buildAssets(output);
  buildPromise ??= buildAssets(output).finally(() => { buildPromise = undefined; });
  return buildPromise;
}

const runAsScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (runAsScript) {
  build().catch((err) => {
    named("build").error("Asset build failed", err);
    process.exitCode = 1;
  });
}

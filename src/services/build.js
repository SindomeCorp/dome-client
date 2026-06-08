import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import less from "less";
import esbuild from "esbuild";
import postcss from "postcss";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";

import { fileURLToPath } from "node:url";
import {
  browserOutputFiles,
  pageEntries,
  playerClientEntries
} from "./browser-entry-manifest.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);

let buildPromise;

async function cleanDir(dir, filter) {
  try {
    const files = await fs.readdir(dir);
    await Promise.all(files.filter(filter).map(f => fs.rm(path.join(dir, f))));
  } catch {
    // ignore if directory doesn't exist
  }
}

async function compileLess() {
  const srcDir = path.join(__dirname, "..", "..", "less");
  const outDir = path.join(__dirname, "..", "..", "public", "css");
  const files = ["client.less"];
  const outFiles = files.map(f => f.replace(/\.less$/, ".css"));
  await fs.mkdir(outDir, { recursive: true });
  await cleanDir(outDir, f => outFiles.includes(f));
  for (const file of files) {
    const full = path.join(srcDir, file);
    const data = await fs.readFile(full, "utf8");
    const output = await less.render(data, { filename: full });
    let plugins = [];
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

async function compileReactCss() {
  const srcFile = path.join(__dirname, "..", "client", "features", "editor", "react", "ide.css");
  const outDir = path.join(__dirname, "..", "..", "public", "css");
  await fs.mkdir(outDir, { recursive: true });
  try {
    const data = await fs.readFile(srcFile, "utf8");
    const result = await postcss([tailwindcss, autoprefixer]).process(data, {
      from: srcFile
    });
    await fs.writeFile(path.join(outDir, "ide.css"), result.css, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
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
  const srcDir = path.join(
    __dirname,
    "..",
    "..",
    "node_modules",
    "ace-builds",
    "src-min-noconflict"
  );
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

export default function build(options = {}) {
  if (!buildPromise) {
    buildPromise = (async () => {
      await Promise.all([
        compileLess(),
        compileReactCss(),
        compileJs(options.jsOutDir),
        compileEjsScripts(options.jsOutDir),
        copyAce(options.aceOutDir),
        copyMooParserWasm(options.parserOutDir),
      ]);
    })();
  }
  return buildPromise;
}

const runAsScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (runAsScript) {
  build().catch((err) => {
    const message = err?.stack || err?.message || String(err);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

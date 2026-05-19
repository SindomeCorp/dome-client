import fs from "node:fs/promises";
import path from "node:path";
import less from "less";
import esbuild from "esbuild";
import postcss from "postcss";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";

import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

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
  const srcFile = path.join(__dirname, "..", "client", "react", "ide.css");
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
  const srcDir = path.join(__dirname, "..", "client");
  const pagesDir = path.join(srcDir, "pages");
  await fs.mkdir(outDir, { recursive: true });
  const pageFiles = [
    "client-connect.js",
    "client-options.js",
    "editor-window.js",
    "note-editor-window.js",
    "logger.js"
  ];
  await Promise.all([
    fs.rm(path.join(outDir, "player-client.js"), { force: true }),
    fs.rm(path.join(outDir, "player-client.min.js"), { force: true }),
    ...pageFiles.map(f => fs.rm(path.join(outDir, f), { force: true }))
  ]);
  const entry = path.join(srcDir, "index.js");
  await esbuild.build({
    bundle: true,
    entryPoints: [entry],
    format: "iife",
    outfile: path.join(outDir, "player-client.js")
  });
  await esbuild.build({
    bundle: true,
    entryPoints: [entry],
    format: "iife",
    minify: true,
    outfile: path.join(outDir, "player-client.min.js")
  });
  const builds = [
    { file: "client-connect.js", external: ["./logger.js"] },
    { file: "client-options.js", external: ["./logger.js"] },
    { file: "editor-window.js", external: ["./logger.js"] },
    { file: "note-editor-window.js", external: [] },
    { file: "logger.js", external: [] },
    { file: "ide-editor-window.js", entry: "ide-editor-window.jsx", external: ["./logger.js"] }
  ];
  for (const { file, entry = file, external } of builds) {
    await esbuild.build({
      bundle: true,
      entryPoints: [path.join(pagesDir, entry)],
      format: "esm",
      external,
      outfile: path.join(outDir, file)
    });
  }
}

async function compileEjsScripts(outDir = path.join(__dirname, "..", "..", "public", "js")) {
  const srcDir = path.join(__dirname, "..", "client", "ejs-scripts");
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

export { cleanDir, compileLess, compileReactCss, compileJs, compileEjsScripts, copyAce };

export default function build(options = {}) {
  if (!buildPromise) {
    buildPromise = (async () => {
      await Promise.all([
        compileLess(),
        compileReactCss(),
        compileJs(options.jsOutDir),
        compileEjsScripts(options.jsOutDir),
        copyAce(options.aceOutDir),
      ]);
    })();
  }
  return buildPromise;
}

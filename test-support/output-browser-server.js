import express from "express";
import { renderFile } from "ejs";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { CLIENT_OPTION_GROUPS } from "../src/shared/client-options.js";
import logger from "../src/logger.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundled = await build({
  entryPoints: [root + "test-support/output-browser-entry.js"], bundle: true, write: false, format: "iife"
});
const presets = JSON.parse(await readFile(root + "data/sindome-output-window-presets.json", "utf8"));
const defaultPresets = JSON.parse(await readFile(root + "data/output-window-presets.json", "utf8"));
const css = await readFile(root + "public/css/client.css", "utf8");
const app = express();
app.get("/runtime.js", (_req, res) => res.type("js").send(bundled.outputFiles[0].text));
app.use(express.static(root + "public"));
app.get("/editor/:type/", (_req, res) => res.type("html").send("<!doctype html><title>Editor fixture</title>"));
app.get("/output-window/", async (_req, res) => {
  const html = await renderFile(root + "views/output-window.ejs", {});
  res.type("html").send(html.replace(/<link[^>]+fonts\.googleapis[^>]+>/g, ""));
});
app.get("/", async (req, res) => {
  const config = { enabled: req.query.splits !== "off", customRegexEnabled: req.query.custom !== "off", presets: req.query.presets === "default" ? defaultPresets : presets };
  const html = await renderFile(root + "views/client.ejs", {
    req: {}, debugMode: true, decache: (value) => value, showReporter: () => true,
    clientOptionGroups: CLIENT_OPTION_GROUPS, shortenEnabled: false, outputWindows: config
  });
  const body = html.replace(/<script defer[^>]+><\/script>/g, "");
  res.type("html").send("<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    + "<link rel=\"stylesheet\" href=\"/css/client.css\"><script>window.__OUTPUT_WINDOWS__="
    + JSON.stringify(config).replace(/</g, "\\u003c") + ";window.__LOG_EXPORT_CSS__="
    + JSON.stringify(css).replace(/</g, "\\u003c")
    + ";</script></head><body class=\"client\">" + body + "<script defer src=\"/runtime.js\"></script></body></html>");
});
const server = app.listen(Number(process.argv[2] || 4318), "127.0.0.1", () => logger.info("Output browser fixture ready."));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));

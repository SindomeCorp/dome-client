import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import ejs from "ejs";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { CLIENT_OPTION_GROUPS } from "../src/shared/client-options.js";
import logger from "../src/logger.js";
import { getContextMenuAvailability } from "../src/services/context-menu-profiles.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundled = await build({
  entryPoints: [root + "test-support/output-browser-entry.js"], bundle: true, write: false, format: "iife"
});
const presets = JSON.parse(await readFile(root + "data/sindome-output-window-presets.json", "utf8"));
const defaultPresets = JSON.parse(await readFile(root + "data/output-window-presets.json", "utf8"));
const css = await readFile(root + "public/css/client.css", "utf8");
const app = express();
const server = createServer(app);
const sockets = new Server(server);
const commands = [];
let connections = 0;
let holdGameReady = false;
const waitingForGame = new Set();
sockets.on("connection", (socket) => {
  connections++;
  socket.on("input", (command, acknowledge) => {
    commands.push(command);
    acknowledge?.();
  });
  if (holdGameReady) {
    holdGameReady = false;
    waitingForGame.add(socket);
    socket.once("disconnect", () => waitingForGame.delete(socket));
  } else {
    socket.emit("connected");
  }
});
app.use(express.json());
app.post("/fixture/data", (req, res) => {
  sockets.emit("data", String(req.body.text));
  res.sendStatus(204);
});
app.post("/fixture/reconnect", (req, res) => {
  holdGameReady = req.body?.holdGameReady === true;
  for (const socket of sockets.sockets.sockets.values()) socket.conn.close();
  res.sendStatus(204);
});
app.post("/fixture/game-ready", (_req, res) => {
  holdGameReady = false;
  for (const socket of waitingForGame) socket.emit("connected");
  waitingForGame.clear();
  res.sendStatus(204);
});
app.get("/fixture/state", (_req, res) => res.json({
  commands, connections, waitingForGame: [...waitingForGame].map(socket => socket.conn.transport.name)
}));
app.get("/runtime.js", (_req, res) => res.type("js").send(bundled.outputFiles[0].text));
app.use("/profiles", express.static(root + "data/profiles", { dotfiles: "ignore", index: false }));
app.use(express.static(root + "public"));
app.get("/editor/:type/", async (req, res) => {
  if (req.params.type !== "ide") return res.type("html").send("<!doctype html><title>Editor fixture</title>");
  const html = await ejs.renderFile(root + "views/editors/ide.ejs", {
    req, meta: { title: "IDE fixture", description: "Local test", keywords: "test" }, decache: (value) => value,
    editor: { ideScratchEnabled: req.query.scratch !== "off", ideHoverOverlaysEnabled: true, ideObjectBrowserEnabled: false, idePropertyBrowserEnabled: false, ideReferenceNavigationEnabled: false }
  });
  res.type("html").send(html.replace(/<link[^>]+fonts\.googleapis[^>]+>/g, ""));
});
app.get("/output-window/", async (_req, res) => {
  const html = await ejs.renderFile(root + "views/output-window.ejs", {});
  res.type("html").send(html.replace(/<link[^>]+fonts\.googleapis[^>]+>/g, ""));
});
app.get("/", async (req, res) => {
  const config = { enabled: req.query.splits !== "off", customRegexEnabled: req.query.custom !== "off", presets: req.query.presets === "default" ? defaultPresets : presets };
  const contextMenus = getContextMenuAvailability({
    enabled: req.query.context !== "off", logger,
    readFile: ["missing", "invalid", "zero"].includes(req.query.context) ? (path) => {
      if (req.query.context === "missing") throw new Error("ENOENT synthetic missing profile");
      if (req.query.context === "zero") return JSON.stringify({ version: 1,
        rules: [{ id: "empty", priority: 0, pattern: "^", captures: {}, actions: [{ id: "copy", label: "Copy", type: "client-action", action: "clipboard.copy", input: "target" }] }],
        profiles: [{ id: path.pathname.split("/").pop().replace(".json", ""), label: "Unusable", rules: ["empty"] }]
      });
      return "{}";
    } : undefined
  });
  const html = await ejs.renderFile(root + "views/client.ejs", {
    req: {}, debugMode: true, decache: (value) => value, showReporter: () => true,
    clientOptionGroups: CLIENT_OPTION_GROUPS, shortenEnabled: false, outputWindows: config, contextMenus
  });
  const realEntry = req.query.entry === "real";
  const body = realEntry ? html : html.replace(/<script defer[^>]+><\/script>/g, "");
  res.type("html").send("<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    + "<link rel=\"stylesheet\" href=\"/css/client.css\"><script>window.__OUTPUT_WINDOWS__="
    + JSON.stringify(config).replace(/</g, "\\u003c") + ";window.__CONTEXT_MENUS__=" + JSON.stringify(contextMenus) + ";window.__LOG_EXPORT_CSS__="
    + JSON.stringify(css).replace(/</g, "\\u003c")
    + ";window.socketUrl=window.location.origin;window.socketUrlSSL=window.location.origin;window.shortenEnabled=false;window.gameName='Local fixture';window.poweredBy='Dome Client';</script></head><body class=\"client\">"
    + body + (realEntry ? "" : "<script defer src=\"/runtime.js\"></script>") + "</body></html>");
});
server.on("error", (error) => {
  logger.error("Output browser fixture could not listen: " + error.message);
  process.exitCode = 1;
});
server.listen(Number(process.argv[2] || 4318), "127.0.0.1", () => logger.info("Output browser fixture ready."));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));

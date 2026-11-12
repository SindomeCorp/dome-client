import { renderFile } from "ejs";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { buildPreferenceDefaults, CLIENT_OPTION_GROUPS } from "../src/shared/client-options.js";
import { OutputWindows } from "../src/client/features/output-windows/output-windows.js";
import { handleRuleRequest } from "../src/client/features/output-windows/rule-worker.js";
import { setupOutputParser } from "../src/client/features/terminal/output-buffer.js";
import { setupAutoscroll } from "../src/client/features/terminal/autoscroll.js";

export class FakeRuleWorker {
  constructor() { this.listeners = {}; this.terminated = false; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  postMessage(message) {
    queueMicrotask(() => {
      if (!this.terminated) handleRuleRequest(message, (data) => this.listeners.message({ data }));
    });
  }
  terminate() { this.terminated = true; }
}

export async function createOutputApp(t, { config = {}, stored, workerFactory = () => new FakeRuleWorker() } = {}) {
  const presets = JSON.parse(readFileSync(new URL("../data/output-window-presets.json", import.meta.url), "utf8"));
  const data = {
    req: {}, debugMode: true, decache: (value) => value, showReporter: () => true,
    clientOptionGroups: CLIENT_OPTION_GROUPS, shortenEnabled: false,
    outputWindows: { enabled: true, customRegexEnabled: true, presets, ...config }
  };
  const html = await renderFile(new URL("../views/client.ejs", import.meta.url).pathname, data);
  const dom = new JSDOM(html, { url: "https://example.com", pretendToBeVisual: true });
  const win = dom.window;
  const doc = win.document;
  const messages = [];
  const memory = new Map(stored ? [["dc-output-windows", stored]] : []);
  const storage = { get: (key) => memory.get(key), put: (key, value) => memory.set(key, value) };
  const logger = { info() {}, warn() {}, error() {}, debug() {} };
  const client = {
    preferences: buildPreferenceDefaults(),
    client: doc.querySelector("#browser-client"),
    buffer: doc.querySelector("#lineBuffer"),
    inputReader: doc.querySelector("#inputBuffer"),
    scrollButton: doc.querySelector("#button-auto-scroll"),
    clientOptionsOverlay: doc.querySelector("#client-options-overlay"),
    health: { showStatus: (message) => messages.push(message) },
    parseYouTubeID: (url) => /youtu(?:\.be\/|be\.com\/watch\?v=)([\w-]{11})/.exec(url)?.[1] || false,
    alert: { active: false },
    scrollBuffer() {}
  };
  const manager = new OutputWindows({ client, doc, win, storage, logger, config: data.outputWindows, workerFactory });
  setupAutoscroll({ client, doc, win });
  setupOutputParser({ client, win, logger });
  const feed = async (text) => {
    client.parseSocketData(text);
    await manager.idle();
    Object.values(manager.views).forEach((view) => view.render());
  };
  t?.after(() => { manager.destroy(); win.close(); });
  return { win, doc, client, manager, storage, memory, messages, feed, presets };
}

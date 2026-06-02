/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import { JSDOM, VirtualConsole } from "jsdom";

export default function setupDom(t, html = "<!doctype html><html><body></body></html>", options = {}) {
  const domOptions = { url: "http://example.com" };
  if (options.suppressNavigationErrors) {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (err) => {
      if (!String(err?.message || "").includes("Not implemented: navigation")) {
        throw err;
      }
    });
    domOptions.virtualConsole = virtualConsole;
  }
  const dom = new JSDOM(html, domOptions);
  const { window } = dom;
  window.LOG_ENDPOINT = null;
  Object.defineProperty(window.navigator, "sendBeacon", { value: () => {}, configurable: true });
  const mockFetch = () => Promise.resolve();
  const localStorage = {
    setItem() {},
    getItem() { return null; },
    removeItem() {}
  };
  const orig = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage
  };
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  globalThis.fetch = mockFetch;
  globalThis.localStorage = localStorage;
  const cleanup = () => {
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    Object.defineProperty(globalThis, "navigator", { value: orig.navigator, configurable: true });
    globalThis.fetch = orig.fetch;
    globalThis.localStorage = orig.localStorage;
  };
  if (t?.after) {
    t.after(cleanup);
  }
  return { window, mockFetch, localStorage, cleanup };
}

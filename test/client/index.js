import { createRequire } from "module";

let JSDOM;
const getJSDOM = () => {
  if (!JSDOM) {
    ({ JSDOM } = createRequire(import.meta.url)("jsdom"));
  }
  return JSDOM;
};

export const setupDom = (html = "<!doctype html><html><body></body></html>") => {
  const JSDOMCtor = getJSDOM();
  const dom = new JSDOMCtor(html, {
    url: "https://example.com/"
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  return { window };
};

export const setupClientOptionsDom = (html) => {
  const { window } = setupDom(html);
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true, writable: true });
  const data = new Map();
  const store = {
    get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    put(key, value) {
      data.set(key, value);
    }
  };
  const { document } = window;
  const origQuery = document.querySelector.bind(document);
  const origQueryAll = document.querySelectorAll.bind(document);
  document.querySelector = (sel) => origQuery(sel.toLowerCase());
  document.querySelectorAll = (sel) => origQueryAll(sel.toLowerCase());
  const origElQuery = window.Element.prototype.querySelector;
  const origElQueryAll = window.Element.prototype.querySelectorAll;
  window.Element.prototype.querySelector = function(sel) {
    return origElQuery.call(this, sel.toLowerCase());
  };
  window.Element.prototype.querySelectorAll = function(sel) {
    return origElQueryAll.call(this, sel.toLowerCase());
  };
  const origClosest = window.Element.prototype.closest;
  window.Element.prototype.closest = function(sel) {
    return origClosest.call(this, sel.toLowerCase());
  };
  return { window, store };
};

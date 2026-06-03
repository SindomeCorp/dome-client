import { test } from "node:test";
import assert from "node:assert/strict";
import { getClientOptionStorageKey } from "../../src/shared/client-options.js";
import {
  getFontFamily,
  getPreferredFont
} from "../../src/client/features/editor/ace/fonts.js";

function withLocalStorage(t, entries = {}) {
  const originalLocalStorage = globalThis.localStorage;
  const data = new Map(Object.entries(entries));
  globalThis.localStorage = {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
  t.after(() => {
    globalThis.localStorage = originalLocalStorage;
  });
  return data;
}

test("editor font preferences prefer editor font over legacy output font", (t) => {
  withLocalStorage(t, {
    [getClientOptionStorageKey("editorfont")]: JSON.stringify("lucida"),
    [getClientOptionStorageKey("outfont")]: JSON.stringify("courier")
  });

  assert.equal(getPreferredFont(), "lucida");
  assert.equal(getFontFamily(), "'Lucida Console'");
});

test("editor font preferences fall back to legacy output font", (t) => {
  withLocalStorage(t, {
    [getClientOptionStorageKey("outfont")]: JSON.stringify("consolas")
  });

  assert.equal(getPreferredFont(), "consolas");
  assert.equal(getFontFamily(), "'Consolas'");
});

test("editor font preferences default on missing, invalid, or unknown values", (t) => {
  const data = withLocalStorage(t);

  assert.equal(getPreferredFont(), "standard");
  assert.equal(getFontFamily("unknown-font"), "'Source Code Pro'");

  data.set(getClientOptionStorageKey("editorfont"), "{bad json");

  assert.equal(getPreferredFont(), "standard");
  assert.equal(getFontFamily(), "'Source Code Pro'");
});

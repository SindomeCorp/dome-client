import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { dome as baseDome } from "../../src/client/b-variables.js";

test("chevron click toggles image", async (t) => {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (err) => {
    if (!String(err?.message || "").includes("Not implemented: navigation")) {
      throw err;
    }
  });
  const dom = new JSDOM("<!doctype html><html><body><div id='lineBuffer'></div></body></html>", { runScripts: "outside-only", virtualConsole });
  const { window } = dom;
  const buffer = window.document.getElementById("lineBuffer");
  const dome = Object.assign(baseDome, {
    buffer,
    preferences: { imagePreview: false, localEcho: true },
    parseYouTubeID: () => false
  });
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;
  t.after(() => {
    globalThis.window = orig.window;
    globalThis.document = orig.document;
  });
  const { setupButtons } = await import("../../src/client/u-buttons.js");
  const { setupChevronToggle } = await import("../../src/client/chevron-toggle.js");

  setupButtons({ client: dome, doc: window.document });
  setupChevronToggle({ client: dome });

  buffer.innerHTML = "<span id=\"simg1\"></span><i id=\"bimg1\" class=\"icon-white icon-chevron-up\" data-image-id=\"img1\" data-image-url=\"https://example.com/img.png\"></i>";
  const control = buffer.querySelector("#bimg1");
  const span = buffer.querySelector("#simg1");

  control.click();
  assert.ok(control.classList.contains("icon-chevron-down"));
  assert.ok(span.querySelector("img"));

  control.click();
  assert.ok(control.classList.contains("icon-chevron-up"));
  assert.equal(span.innerHTML, "");
});

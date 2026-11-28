import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { createClientState } from "../../src/client/core/client-state.js";

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
  const dome = Object.assign(createClientState(), {
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
  const { setupButtons } = await import("../../src/client/features/terminal/buttons.js");
  const { setupChevronToggle } = await import("../../src/client/features/terminal/chevron-toggle.js");

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

test("only complete preview controls can toggle an image", async (t) => {
  const console = new VirtualConsole();
  const errors = [];
  console.on("jsdomError", error => errors.push(error));
  const { window } = new JSDOM(`<div id="buffer">
    <i id="ordinary"></i>
    <i id="missing-url" class="icon-chevron-up" data-image-id="preview"></i>
    <i id="missing-id" class="icon-chevron-up" data-image-url="https://fixture.invalid/image.png"></i>
    <i id="complete" class="icon-chevron-down" data-image-id="preview" data-image-url="https://fixture.invalid/image.png"><span></span></i>
  </div>`, { virtualConsole: console });
  t.after(() => window.close());
  const { setupChevronToggle } = await import("../../src/client/features/terminal/chevron-toggle.js");
  assert.doesNotThrow(() => setupChevronToggle({ client: {} }));

  const buffer = window.document.querySelector("#buffer");
  const client = { buffer };
  setupChevronToggle({ client });
  buffer.querySelector("#complete span").click();
  assert.deepEqual(errors, []);

  const toggleImage = t.mock.fn();
  client.toggleImage = toggleImage;
  for (const id of ["ordinary", "missing-url", "missing-id"]) buffer.querySelector("#" + id).click();
  assert.equal(toggleImage.mock.callCount(), 0);

  const complete = buffer.querySelector("#complete");
  complete.querySelector("span").click();
  assert.deepEqual(toggleImage.mock.calls[0].arguments, [complete, "preview", "https://fixture.invalid/image.png"]);
  assert.deepEqual(errors, []);
});

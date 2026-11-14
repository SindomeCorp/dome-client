import test from "node:test";
import assert from "node:assert/strict";
import { createOutputApp } from "../../test-support/output-app.js";
import { readClientPreferences } from "../../src/client/features/options/client-option-parser.js";
import { createClientOptionsStore } from "../../src/client/features/options/client-options-store.js";
import { createClientOptionsController } from "../../src/client/features/options/client-options-controller.js";
import { buildExportPayload, importClientOptionsJson } from "../../src/client/features/options/client-options-import-export-ui.js";
import { exportSnapshot } from "../../src/client/features/output-windows/history-tools.js";

test("secondary migration copies resolved main preferences once and preserves later independent values", () => {
  const saved = new Map([["dc-toggle-outfont", "menlo"], ["dc-toggle-colorset", "snow"]]);
  const read = (query = "") => {
    const result = readClientPreferences({ locationSearch: query, getStoredValue: (key) => saved.get(key) ?? null });
    for (const { key, value } of result.persistenceUpdates) saved.set(key, value);
    return result.preferences;
  };
  const first = read("?oz=14");
  assert.equal(first.secondaryLineBufferFont, "menlo");
  assert.equal(first.secondaryColorSet, "snow");
  assert.equal(first.secondaryLineBufferFontSizePt, 14);
  saved.set("dc-toggle-outfont", "courier");
  saved.set("dc-toggle-colorset", "acid");
  const next = read();
  assert.equal(next.secondaryLineBufferFont, "menlo");
  assert.equal(next.secondaryColorSet, "snow");
  assert.equal(next.secondaryLineBufferFontSizePt, 14);
  saved.set("dc-toggle-secondaryoutfontsize", 100);
  assert.equal(read("?oz=16").secondaryLineBufferFontSizePt, 16);
  assert.equal(read("?sof=lucida&scl=dim&soz=12").secondaryLineBufferFont, "lucida");
});

test("the standalone options store persists secondary defaults instead of following later main edits", () => {
  const saved = new Map([["dc-toggle-outfont", "courier"]]);
  const options = createClientOptionsStore({ storage: { get: (key) => saved.get(key), put: (key, value) => saved.set(key, value) } });
  assert.equal(options.get("secondaryoutfont").state, "courier");
  options.save("outfont", "menlo");
  assert.equal(options.get("secondaryoutfont").state, "courier");
});

test("URL secondary settings reach controls, export/import, and subsequent visits with fresh or existing storage", async (t) => {
  for (const existing of [false, true]) {
    const { options, client, controller, memory, win } = await presentationApp(t);
    if (!existing) {
      for (const key of ["secondaryoutfont", "secondarycolorset", "secondaryoutfontsize"]) memory.delete("dc-toggle-" + key);
    }
    win.history.replaceState(null, "", "/?of=menlo&cl=acid&oz=14&sof=courier&scl=snow&soz=18");
    client.preferences = controller.readPreferences();
    const exported = buildExportPayload({ options });
    assert.equal(client.preferences.secondaryLineBufferFont, "courier");
    assert.deepEqual([exported.preferences.secondaryoutfont, exported.preferences.secondarycolorset, exported.preferences.secondaryoutfontsize], ["courier", "snow", 18]);
    options.save("secondaryoutfont", "lucida");
    await importClientOptionsJson({
      file: { text: async () => JSON.stringify(exported) }, options,
      actions: { appendOutput() {}, scrollBuffer() {} },
      applyOptionValue: (name, value) => controller.setOption(name, value), refreshClientOptions() {}, showToast() {}
    });
    win.history.replaceState(null, "", "/");
    const next = controller.readPreferences();
    assert.deepEqual([next.secondaryLineBufferFont, next.secondaryColorSet, next.secondaryLineBufferFontSizePt], ["courier", "snow", 18]);
    client.preferences = next;
    win.history.replaceState(null, "", "/?of=menlo&cl=acid&oz=14");
    client.preferences = controller.readPreferences();
    await importClientOptionsJson({
      file: { text: async () => "{}" }, options,
      actions: { getPreference: (name) => client.preferences[name], appendOutput() {}, scrollBuffer() {} },
      applyOptionValue: (name, value) => controller.setOption(name, value), refreshClientOptions() {}, showToast() {}
    });
    assert.deepEqual([client.preferences.secondaryLineBufferFont, client.preferences.secondaryColorSet, client.preferences.secondaryLineBufferFontSizePt], ["menlo", "acid", 14]);
  }
});

async function presentationApp(t) {
  const app = await createOutputApp(t);
  const storage = { ...app.storage, get: (key) => app.storage.get(key) ?? null };
  const options = createClientOptionsStore({ storage });
  const controller = createClientOptionsController({ ...app, storage, options });
  app.client.preferences = controller.readPreferences();
  return { ...app, options, controller };
}

test("secondary edits update existing output without changing main rows or rebuilding history indexes", async (t) => {
  const { manager, client, feed, controller } = await presentationApp(t);
  manager.updateSettings({ open: true, selected: ["grid-output"] });
  await feed("main\n[g] secondary\n");
  const mainRow = manager.views.main.mounted.get(1);
  const index = manager.views.secondary.index;
  controller.setOption("secondaryLineBufferFont", "courier");
  controller.setOption("secondaryLineBufferFontSizePt", 16);
  controller.setOption("secondaryColorSet", "snow");
  const secondary = manager.views.secondary;
  secondary.render();
  assert.equal(manager.views.main.mounted.get(1), mainRow);
  assert.equal(secondary.index, index);
  assert.ok(secondary.element.classList.contains("courierText"));
  assert.ok(secondary.element.classList.contains("colorset-snow"));
  assert.equal(secondary.element.style.fontSize, "16pt");
  assert.equal(client.inputReader.classList.contains("colorset-snow"), false);
  controller.setOption("colorSet", "acid");
  assert.ok(secondary.element.classList.contains("colorset-snow"));
  assert.equal(secondary.element.classList.contains("colorset-acid"), false);
  controller.setOption("lineBufferFont", "menlo");
  controller.setOption("lineBufferFontSizePt", 12);
  const html = (await exportSnapshot(await manager.snapshot(), { client })).join("");
  assert.match(html, /id="lineBuffer" class="menloText colorset-acid" style="font-size:12pt;line-height:15pt"/);
  assert.doesNotMatch(html, /courierText|colorset-snow|font-size:16pt/);
  assert.ok(html.indexOf("main</div>") < html.indexOf("secondary</div>"));
});

test("presentation export/import round-trips and old, partial, or invalid secondary imports copy resulting main values", async (t) => {
  const { options, controller, client } = await presentationApp(t);
  const messages = [];
  const load = (preferences) => importClientOptionsJson({
    file: { text: async () => JSON.stringify({ preferences }) }, options,
    actions: { appendOutput: (message) => messages.push(message), scrollBuffer() {} },
    applyOptionValue: (name, value) => controller.setOption(name, value), refreshClientOptions() {}, showToast() {}
  });
  controller.setOption("outfont", "menlo");
  controller.setOption("secondaryoutfont", "courier");
  controller.setOption("secondarycolorset", "snow");
  controller.setOption("secondaryoutfontsize", 18);
  const exported = buildExportPayload({ options });
  assert.equal(exported.preferences.secondaryoutfont, "courier");
  controller.setOption("secondaryoutfont", "lucida");
  await load(exported.preferences);
  assert.equal(client.preferences.secondaryLineBufferFont, "courier");
  assert.equal(client.preferences.secondaryLineBufferFontSizePt, 18);
  await load({ outfont: "roboto", colorset: "acid", outfontsize: 14 });
  assert.equal(client.preferences.secondaryLineBufferFont, "roboto");
  assert.equal(client.preferences.secondaryColorSet, "acid");
  assert.equal(client.preferences.secondaryLineBufferFontSizePt, 14);
  await load({ outfont: "menlo", secondarycolorset: "snow", secondaryoutfontsize: 99 });
  assert.equal(client.preferences.secondaryLineBufferFont, "menlo");
  assert.equal(client.preferences.secondaryColorSet, "snow");
  assert.equal(client.preferences.secondaryLineBufferFontSizePt, 14);
  assert.ok(messages.some((message) => /Skipped 1 invalid/.test(message)));
});

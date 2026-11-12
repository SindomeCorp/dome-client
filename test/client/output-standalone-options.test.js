import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderFile } from "ejs";
import { setupStandaloneOutputOptions } from "../../src/client/features/output-windows/standalone-options.js";
import { CLIENT_OPTION_GROUPS } from "../../src/shared/client-options.js";
import { outputWindowDefaults } from "../../src/shared/output-windows.js";
import { FakeRuleWorker } from "../../test-support/output-app.js";

test("connection-page output options persist and participate in imports and resets", async (t) => {
  const html = await renderFile(new URL("../../views/partials/client-options-overlay.ejs", import.meta.url).pathname, {
    clientOptionGroups: CLIENT_OPTION_GROUPS, shortenEnabled: false
  });
  const dom = new JSDOM(html);
  t.after(() => dom.window.close());
  let value;
  const storage = { get: () => value, put: (_key, next) => { value = next; } };
  const { model, actions } = setupStandaloneOutputOptions({ doc: dom.window.document, win: dom.window, storage, workerFactory: () => new FakeRuleWorker() });
  const layout = dom.window.document.querySelector("#output-layout");
  layout.value = "left";
  layout.dispatchEvent(new dom.window.Event("change"));
  assert.equal(value.open, true);
  assert.equal(value.position, "left");
  assert.equal(actions.getOutputWindows().position, "left");
  actions.resetOutputWindows();
  assert.equal(value.open, false);
  assert.equal(actions.importOutputWindows({ ...outputWindowDefaults(), position: "top" }).valid, true);
  assert.equal(value.position, "top");
  assert.equal(actions.importOutputWindows({ version: 10 }).valid, false);
  assert.equal(value.position, "top");
  model.runner.cancel();
});

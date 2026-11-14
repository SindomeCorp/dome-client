import test from "node:test";
import assert from "node:assert/strict";
import { createOutputApp } from "../../test-support/output-app.js";
import { setupEditorSupport } from "../../src/client/features/editor/editor-support.js";

async function editorApp(t) {
  const app = await createOutputApp(t);
  Object.assign(app.client, { spawned: {}, editorListView: app.doc.querySelector("#editor-list-view"), openIDE: t.mock.fn() });
  setupEditorSupport({ client: app.client, win: app.win });
  return app;
}

test("IDE payloads never create an empty editor list regardless of network chunk boundaries", async (t) => {
  for (const split of [false, true]) {
    const { client, feed } = await editorApp(t);
    const body = "#$# edit name: foo upload: @program foo\nline1\n";
    if (split) { await feed(body); await feed(".\n"); }
    else await feed(body + ".\n");
    assert.equal(client.openIDE.mock.callCount(), 1);
    assert.deepEqual(client.spawned, {});
    assert.equal(client.editorListView.innerHTML, "");
    assert.equal(client.editorListView.style.display, "none");
  }
});

test("the editor list removes null, closed, and non-window entries and hides when no windows remain", async (t) => {
  const { client } = await editorApp(t);
  const live = { focus() {}, close() {}, closed: false };
  client.spawned = { Null: null, Closed: { ...live, closed: true }, Bogus: {}, Live: live };
  client.updateEditorListView();
  assert.deepEqual(Object.keys(client.spawned), ["Live"]);
  assert.equal(client.editorListView.querySelectorAll("li").length, 1);
  assert.equal(client.editorListView.style.display, "");
  live.closed = true;
  client.updateEditorListView();
  assert.equal(client.editorListView.style.display, "none");
  assert.equal(client.editorListView.innerHTML, "");
});

test("declining editor replacement preserves the existing individual window in the list", async (t) => {
  const { client, feed } = await editorApp(t);
  client.preferences.editorType = "windows";
  const previous = { focus() {}, close() {}, confirm: () => false, closed: false };
  client.spawned.foo = previous;
  await feed("#$# edit name: foo upload: @program foo\nreplacement\n.\n");
  assert.equal(client.spawned.foo, previous);
  assert.equal(client.editorListView.querySelectorAll("li").length, 1);
});

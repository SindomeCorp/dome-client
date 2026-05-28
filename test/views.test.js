import test from "node:test";
import assert from "node:assert";
import { renderFile } from "ejs";
import { glob } from "glob";
import fs from "node:fs/promises";

const sampleData = {
  "views/layouts/main.ejs": {
    meta: { title: "", description: "", keywords: "" },
    req: { query: {}, ip: "", device: "", bodyClass: "" },
    debugMode: false,
    socketUrl: "",
    socketUrlSSL: "",
    poweredBy: "",
    gameName: "",
    isMultiMud: false,
    guestConnectCommand: "",
    shortenEnabled: false,
    decache: (v) => v,
    mainWebsite: "",
    body: "",
  },
  "views/shells/child-window-header.ejs": {
    meta: { title: "", description: "", keywords: "" },
    decache: (v) => v,
  },
  "views/shells/child-window-ide-header.ejs": {
    meta: { title: "", description: "", keywords: "" },
    decache: (v) => v,
  },
  "views/client.ejs": {
    req: { query: {}, device: "" },
    debugMode: false,
    decache: (v) => v,
    showReporter: () => false,
    shortenEnabled: false,
  },
  "views/connect-as.ejs": {
    req: { query: {} },
    session: { user: { chars: [] } },
    mooName: "Anaconda",
    isMultiMud: false,
    mooHostname: "moo.sindome.org",
    mooPort: 5555,
    connected: () => ({ count: 0, games: [] }),
    showWebsiteAuth: false,
    signupUrl: "",
    version: "",
    decache: (v) => v,
    meta: { title: "", description: "", keywords: "" },
    shortenEnabled: false,
  },
  "views/game-owner-questions.ejs": {
    meta: { title: "", description: "", keywords: "" },
  },
  "views/editors/verb.ejs": {
    req: { query: {} },
    editor: { readonly: true },
    meta: { title: "", description: "", keywords: "" },
    decache: (v) => v,
  },
  "views/editors/basic.ejs": {
    editor: { readonly: true },
    meta: { title: "", description: "", keywords: "" },
    decache: (v) => v,
  },
  "views/editors/note-viewer.ejs": {
    editor: { readonly: true },
    meta: { title: "", description: "", keywords: "" },
    decache: (v) => v,
  },
  "views/editors/ide.ejs": {
    req: { query: {} },
    editor: { readonly: true },
    meta: { title: "", description: "", keywords: "" },
    decache: (v) => v,
  },
  "views/partials/mini-controls.ejs": {
    req: {},
    showReporter: () => false,
  },
  "views/partials/client-options-overlay.ejs": {
    shortenEnabled: false,
  },
};

const files = await glob("views/**/*.ejs");

for (const file of files) {
  test(`renders ${file}`, async () => {
    await fs.access(file);
    const data = sampleData[file] || {};
    const html = await renderFile(file, data);
    if (file === "views/client.ejs") {
      assert.match(html, /id="editor-list-view"/);
      const inputBuffer = html.match(/<textarea[^>]*id="inputBuffer"[^>]*>/s)?.[0] ?? "";
      assert.match(inputBuffer, /id="inputBuffer"/);
      assert.match(inputBuffer, /inputmode="text"/);
      assert.match(inputBuffer, /autocapitalize="none"/);
      assert.match(inputBuffer, /autocomplete="off"/);
      assert.match(inputBuffer, /autocorrect="off"/);
      assert.doesNotMatch(inputBuffer, /spellcheck=/);
    }
    if (file === "views/partials/client-options-overlay.ejs") {
      assert.match(html, /role="tablist"/);
      assert.match(html, />General</);
      assert.match(html, />Presentation</);
      assert.match(html, />Local Editor</);
      assert.match(html, />Import\/Export</);
      assert.match(html, />Theme</);
      assert.match(html, />Input Font</);
      assert.match(html, />Output Font Size \(pt\)</);
      assert.match(html, />Input Font Size \(pt\)</);
      assert.match(html, />Export File</);
      assert.match(html, />Import File</);
      assert.match(html, />Reset to Defaults</);
      assert.match(html, />Input Font Color</);
      assert.match(html, />Input Background Color</);
      assert.match(html, />Editor Type</);
      assert.match(html, />Editor Theme</);
      assert.doesNotMatch(html, /admin only/);
      assert.doesNotMatch(html, /Output Colors/);
    }
    if (file === "views/layouts/main.ejs") {
      assert.match(html, /href="\/css\/client\.css"/);
      assert.doesNotMatch(html, /dome-extract\.css/);
    }
  });
}

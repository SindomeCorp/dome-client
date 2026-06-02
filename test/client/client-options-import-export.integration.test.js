import { test } from "node:test";
import assert from "node:assert/strict";
import { setupClientOptionsDom } from "./index.js";
import { dome } from "../../src/client/b-variables.js";

test("client-options import/export controls round-trip preferences", async () => {
  const html = `<!doctype html><html><body>
  <div class="client-options-page">
    <div id="commands-option" class="option-row">
      <button class="enabled-state btn-primary" data-val="true">on</button>
      <button class="disabled-state" data-val="false">off</button>
    </div>
    <div id="edittheme-option" class="option-row">
      <select>
        <option value="twilight">twilight</option>
        <option value="ambience">ambience</option>
        <option value="tomorrow_night">tomorrow_night</option>
      </select>
    </div>
    <div id="buffer-option" class="option-row">
      <input type="number" value="0" />
    </div>
    <button id="client-options-export">Export</button>
    <button id="client-options-import">Import</button>
    <input id="client-options-import-file" type="file" />
    <button id="client-options-reset-defaults">Reset</button>
    <span id="client-options-import-export-indicator" class="hide">Saved</span>
  </div>
  </body></html>`;

  const { window, store } = setupClientOptionsDom(html);
  const output = [];
  Object.assign(dome, {
    buffer: {
      append: (text) => output.push(text)
    },
    scrollBuffer() {}
  });

  let exportedBlob;
  let exportedFilename;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = window.HTMLAnchorElement.prototype.click;
  const originalConfirm = window.confirm;
  URL.createObjectURL = (blob) => {
    exportedBlob = blob;
    return "blob:test";
  };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function() {
    exportedFilename = this.download;
  };
  window.confirm = () => true;

  try {
    const options = await import(`../../src/client/pages/client-options.js?import-export=${Date.now()}`);
    Object.assign(options.store, store);
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

    options.clientOptions.save("commands", false);
    options.clientOptions.save("edittheme", "twilight");
    options.clientOptions.save("buffer", 5);

    window.document.getElementById("client-options-export").click();
    assert.ok(exportedBlob);
    assert.match(exportedFilename || "", /^dome-client-options-.*\.json$/);
    const exportedText = await exportedBlob.text();
    const exportedJson = JSON.parse(exportedText);
    assert.equal(exportedJson.type, "dome-client-options");
    assert.equal(exportedJson.version, 1);
    assert.equal(exportedJson.preferences.commands, false);
    assert.equal(exportedJson.preferences.edittheme, "twilight");
    assert.equal(exportedJson.preferences.buffer, 5);

    const importPayload = {
      preferences: {
        commands: "true",
        edittheme: "ambiance",
        buffer: 42,
        logcss: false,
        unknownOption: "ignored"
      }
    };
    const importInput = window.document.getElementById("client-options-import-file");
    Object.defineProperty(importInput, "files", {
      configurable: true,
      value: [{ text: async () => JSON.stringify(importPayload) }]
    });
    importInput.dispatchEvent(new window.Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(options.clientOptions.get("commands").state, true);
    assert.equal(options.clientOptions.get("edittheme").state, "ambience");
    assert.equal(options.clientOptions.get("buffer").state, 42);
    assert.equal(options.clientOptions.get("logcss").state, false);
    assert.ok(output.some((line) => line.includes("Imported 4 client options.")));

    window.document.getElementById("client-options-reset-defaults").click();
    assert.equal(options.clientOptions.get("commands").state, true);
    assert.equal(options.clientOptions.get("buffer").state, 0);
    assert.equal(options.clientOptions.get("logcss").state, true);
    assert.ok(output.some((line) => line.includes("Reset all client options to defaults.")));

    Object.defineProperty(importInput, "files", {
      configurable: true,
      value: [{ text: async () => "{bad-json" }]
    });
    importInput.dispatchEvent(new window.Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(output.some((line) => line.includes("Client options import error: invalid JSON file.")));
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    window.HTMLAnchorElement.prototype.click = originalAnchorClick;
    window.confirm = originalConfirm;
  }
});

test("client-options import rejects non-object payload", async () => {
  const html = `<!doctype html><html><body>
  <div class="client-options-page">
    <button id="client-options-export">Export</button>
    <button id="client-options-import">Import</button>
    <input id="client-options-import-file" type="file" />
    <button id="client-options-reset-defaults">Reset</button>
    <span id="client-options-import-export-indicator" class="hide">Saved</span>
  </div>
  </body></html>`;
  const { window, store } = setupClientOptionsDom(html);
  const output = [];
  Object.assign(dome, {
    buffer: {
      append: (text) => output.push(text)
    },
    scrollBuffer() {}
  });
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  try {
    const options = await import(`../../src/client/pages/client-options.js?import-error=${Date.now()}`);
    Object.assign(options.store, store);
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    const importInput = window.document.getElementById("client-options-import-file");
    Object.defineProperty(importInput, "files", {
      configurable: true,
      value: [{ text: async () => "[]" }]
    });
    importInput.dispatchEvent(new window.Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(output.some((line) => line.includes("JSON must be an object of option keys.")));
  } finally {
    window.confirm = originalConfirm;
  }
});

test("client-options reset cancellation keeps current preferences", async () => {
  const html = `<!doctype html><html><body>
  <div class="client-options-page">
    <div id="commands-option" class="option-row">
      <button class="enabled-state btn-primary" data-val="true">on</button>
      <button class="disabled-state" data-val="false">off</button>
    </div>
    <button id="client-options-export">Export</button>
    <button id="client-options-import">Import</button>
    <input id="client-options-import-file" type="file" />
    <button id="client-options-reset-defaults">Reset</button>
    <span id="client-options-import-export-indicator" class="hide">Saved</span>
  </div>
  </body></html>`;
  const { window, store } = setupClientOptionsDom(html);
  Object.assign(dome, {
    buffer: { append() {} },
    scrollBuffer() {}
  });
  const originalConfirm = window.confirm;
  window.confirm = () => false;
  try {
    const options = await import(`../../src/client/pages/client-options.js?reset-cancel=${Date.now()}`);
    Object.assign(options.store, store);
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    options.clientOptions.save("commands", false);
    window.document.getElementById("client-options-reset-defaults").click();
    assert.equal(options.clientOptions.get("commands").state, false);
  } finally {
    window.confirm = originalConfirm;
  }
});

test("client-options import applies valid values and reports skipped invalid values", async () => {
  const html = `<!doctype html><html><body>
  <div class="client-options-page">
    <div id="commands-option" class="option-row">
      <button class="enabled-state btn-primary" data-val="true">on</button>
      <button class="disabled-state" data-val="false">off</button>
    </div>
    <div id="edittheme-option" class="option-row">
      <select>
        <option value="twilight">twilight</option>
        <option value="ambience">ambience</option>
      </select>
    </div>
    <button id="client-options-export">Export</button>
    <button id="client-options-import">Import</button>
    <input id="client-options-import-file" type="file" />
    <button id="client-options-reset-defaults">Reset</button>
    <span id="client-options-import-export-indicator" class="hide">Saved</span>
  </div>
  </body></html>`;
  const { window, store } = setupClientOptionsDom(html);
  const output = [];
  Object.assign(dome, {
    buffer: { append: (text) => output.push(text) },
    scrollBuffer() {}
  });
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  try {
    const options = await import(`../../src/client/pages/client-options.js?partial-invalid=${Date.now()}`);
    Object.assign(options.store, store);
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

    const importInput = window.document.getElementById("client-options-import-file");
    Object.defineProperty(importInput, "files", {
      configurable: true,
      value: [{
        text: async () => JSON.stringify({
          preferences: {
            commands: "false",
            edittheme: "not-a-theme",
            unknownOption: true
          }
        })
      }]
    });
    importInput.dispatchEvent(new window.Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(options.clientOptions.get("commands").state, false);
    assert.equal(options.clientOptions.get("edittheme").state, "twilight");
    assert.ok(output.some((line) => line.includes("Imported 1 client option.")));
    assert.ok(output.some((line) => line.includes("Skipped 1 invalid imported option value.")));
  } finally {
    window.confirm = originalConfirm;
  }
});

test("client-options import cancellation does not open file picker", async () => {
  const html = `<!doctype html><html><body>
  <div class="client-options-page">
    <button id="client-options-export">Export</button>
    <button id="client-options-import">Import</button>
    <input id="client-options-import-file" type="file" />
    <button id="client-options-reset-defaults">Reset</button>
    <span id="client-options-import-export-indicator" class="hide">Saved</span>
  </div>
  </body></html>`;
  const { window, store } = setupClientOptionsDom(html);
  Object.assign(dome, {
    buffer: { append() {} },
    scrollBuffer() {}
  });
  const originalConfirm = window.confirm;
  window.confirm = () => false;
  try {
    const options = await import(`../../src/client/pages/client-options.js?import-cancel=${Date.now()}`);
    Object.assign(options.store, store);
    window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
    const importInput = window.document.getElementById("client-options-import-file");
    let clickCount = 0;
    importInput.click = () => {
      clickCount += 1;
    };
    window.document.getElementById("client-options-import").click();
    assert.equal(clickCount, 0);
  } finally {
    window.confirm = originalConfirm;
  }
});

test("client-options import change with no selected file is a no-op", async () => {
  const html = `<!doctype html><html><body>
  <div class="client-options-page">
    <div id="commands-option" class="option-row">
      <button class="enabled-state btn-primary" data-val="true">on</button>
      <button class="disabled-state" data-val="false">off</button>
    </div>
    <button id="client-options-export">Export</button>
    <button id="client-options-import">Import</button>
    <input id="client-options-import-file" type="file" />
    <button id="client-options-reset-defaults">Reset</button>
    <span id="client-options-import-export-indicator" class="hide">Saved</span>
  </div>
  </body></html>`;
  const { window, store } = setupClientOptionsDom(html);
  const output = [];
  Object.assign(dome, {
    buffer: { append: (text) => output.push(text) },
    scrollBuffer() {}
  });
  const options = await import(`../../src/client/pages/client-options.js?import-empty=${Date.now()}`);
  Object.assign(options.store, store);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

  const importInput = window.document.getElementById("client-options-import-file");
  Object.defineProperty(importInput, "files", {
    configurable: true,
    value: []
  });
  importInput.dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(options.clientOptions.get("commands").state, true);
  assert.equal(output.length, 0);
});

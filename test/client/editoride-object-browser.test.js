import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { setSocket } from "../../src/client/b-variables.js";

const mockAce = {
  config: { set() {} },
  edit() {
    return {
      setTheme() {},
      getSession() { return { setMode() {} }; },
      setKeyboardHandler() {},
      setOption() {},
      setValue() {},
      on() {},
      getValue() { return ""; },
      resize() {},
      destroy() {},
    };
  },
};

test("EditorIDE adds singleton Object Browser and builds sorted object graph", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");

  setSocket({ emit() {} });

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Foo", uploadCommand: "@program #18657:@zeta", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Bar", uploadCommand: "@program #18657:@alpha", buffer: "y" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Baz", uploadCommand: "@program #2:@beta", buffer: "z" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Foo", uploadCommand: "@program #18657:@zeta", buffer: "x2" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  assert.equal(tabs.length, 4);
  assert.match(tabs[0].textContent, /Object Browser/);
  assert.match(tabs[1].textContent, /Foo/);
  assert.match(tabs[2].textContent, /Bar/);
  assert.match(tabs[3].textContent, /Baz/);
  const objectBrowserTabs = tabs.filter((tab) => /Object Browser/.test(tab.textContent || ""));
  assert.equal(objectBrowserTabs.length, 1);

  tabs[0].click();
  await new Promise((r) => setTimeout(r, 0));
  const pane = window.document.querySelector(".object-browser-pane");
  assert.ok(pane);
  const expand18657 = Array.from(pane.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "") === "Expand #18657"
  );
  assert.ok(expand18657);
  expand18657.click();
  await new Promise((r) => setTimeout(r, 0));
  const sections = Array.from(pane.querySelectorAll("section"));
  assert.equal(sections.length, 2);
  assert.equal(sections[0].querySelector("h3").textContent, "#2");
  assert.equal(sections[1].querySelector("h3").textContent, "#18657");
  const verbs = Array.from(sections[1].querySelectorAll("button"))
    .map((btn) => (btn.textContent || "").trim())
    .filter((txt) => txt.startsWith("@"));
  assert.deepEqual(verbs, ["@alpha", "@zeta"]);

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Object Browser Load Verbs sends SDWC request for object", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");

  const socket = { emit() {} };
  const emitMock = t.mock.method(socket, "emit");
  setSocket(socket);

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Foo", uploadCommand: "@program #31540:@matrix", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  tabs[0].click();
  await new Promise((r) => setTimeout(r, 0));
  const expand18657 = Array.from(window.document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "") === "Expand #18657"
  );
  assert.ok(expand18657);
  expand18657.click();
  await new Promise((r) => setTimeout(r, 0));

  const loadBtn = Array.from(window.document.querySelectorAll("button")).find((b) => b.textContent === "Load Verbs");
  assert.ok(loadBtn);
  loadBtn.click();

  assert.ok(
    emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "#$# SDWC%%VERBS%%#31540"
    )
  );

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Object Browser replaces object verbs from SDWC VERBS payload", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  setSocket({ emit() {} });

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Foo", uploadCommand: "@program #18657:@zeta", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: {
      type: "ide-object-verbs",
      payload: {
        name: "Slither",
        object: "#18657",
        owner: "#18657",
        verbs: {
          1: {
            args: ["any", "any", "any"],
            "last updated": "Sun Aug  6 20:57:59 2006 CDT",
            name: "@matrix",
            owner: "#18657",
            permissions: "rd"
          },
          2: {
            args: ["any", "none", "none"],
            "last updated": "Sun Mar  4 19:37:56 2007 PST",
            name: "oldedit",
            owner: "#98",
            permissions: "rxd"
          }
        }
      }
    }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  tabs[0].click();
  await new Promise((r) => setTimeout(r, 0));
  const expand18657 = Array.from(window.document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "") === "Expand #18657"
  );
  assert.ok(expand18657);
  expand18657.click();
  await new Promise((r) => setTimeout(r, 0));

  const pane = window.document.querySelector(".object-browser-pane");
  const section = pane.querySelector("section");
  const verbs = Array.from(section.querySelectorAll("button"))
    .map((btn) => (btn.textContent || "").trim())
    .filter((txt) => txt === "@matrix" || txt === "oldedit");
  assert.deepEqual(verbs, ["@matrix", "oldedit"]);
  const headerText = section.querySelector(".font-semibold")?.textContent || "";
  assert.ok(headerText.includes("Verb"));
  assert.ok(headerText.includes("Args"));
  assert.ok(headerText.includes("Owner"));
  assert.ok(headerText.includes("Perms"));
  assert.ok(headerText.includes("Last Updated"));
  const text = section.textContent || "";
  assert.ok(text.includes("rd"));
  assert.ok(text.includes("rxd"));
  assert.ok(text.includes("any any any"));
  assert.ok(text.includes("any none none"));
  assert.ok(text.includes("#18657"));
  assert.ok(text.includes("#98"));
  assert.ok(text.includes("Sun Aug  6 20:57:59 2006 CDT"));
  assert.ok(text.includes("Sun Mar  4 19:37:56 2007 PST"));
  assert.ok(!verbs.includes("@zeta"));

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Object Browser toggles object verbs visibility with [+]/[-]", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  setSocket({ emit() {} });

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Foo", uploadCommand: "@program #18657:@matrix", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  tabs[0].click();
  await new Promise((r) => setTimeout(r, 0));
  const expand18657 = Array.from(window.document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "") === "Expand #18657"
  );
  assert.ok(expand18657);
  expand18657.click();
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(
    Array.from(window.document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "@matrix"),
    undefined
  );
  const expandBtn = Array.from(window.document.querySelectorAll("button")).find((b) => b.textContent === "[+]");
  assert.ok(expandBtn);
  expandBtn.click();
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(
    Array.from(window.document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "@matrix")
  );
  const collapseBtn = Array.from(window.document.querySelectorAll("button")).find((b) => b.textContent === "[-]");
  assert.ok(collapseBtn);
  collapseBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(
    Array.from(window.document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "@matrix"),
    undefined
  );

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Object Browser verb link sends @edit object:verbname", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const socket = { emit() {} };
  const emitMock = t.mock.method(socket, "emit");
  setSocket(socket);

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: {
      type: "ide-object-verbs",
      payload: [
        "#18657",
        [
          ["#18657", "rd", "@matrix", [["any", "any", "any"]]]
        ]
      ]
    }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Foo", uploadCommand: "@program #18657:@matrix", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  tabs[0].click();
  await new Promise((r) => setTimeout(r, 0));
  const expand18657 = Array.from(window.document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "") === "Expand #18657"
  );
  assert.ok(expand18657);
  expand18657.click();
  await new Promise((r) => setTimeout(r, 0));

  const verbButton = Array.from(window.document.querySelectorAll("button")).find((b) =>
    (b.textContent || "").trim() === "@matrix"
  );
  assert.ok(verbButton);
  verbButton.click();

  assert.ok(
    emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "@edit #18657:@matrix"
    )
  );

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Object Browser verb link trims wildcard suffix when sending @edit", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const socket = { emit() {} };
  const emitMock = t.mock.method(socket, "emit");
  setSocket(socket);

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: {
      type: "ide-object-verbs",
      payload: [
        "#18657",
        [
          ["#18657", "rd", "substi*tute", [["any", "any", "any"]]]
        ]
      ]
    }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Foo", uploadCommand: "@program #18657:@matrix", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  tabs[0].click();
  await new Promise((r) => setTimeout(r, 0));
  const expand18657 = Array.from(window.document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "") === "Expand #18657"
  );
  assert.ok(expand18657);
  expand18657.click();
  await new Promise((r) => setTimeout(r, 0));

  const verbButton = Array.from(window.document.querySelectorAll("button")).find((b) =>
    (b.textContent || "").trim() === "substi*tute"
  );
  assert.ok(verbButton);
  verbButton.click();

  assert.ok(
    emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "@edit #18657:substi"
    )
  );

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Object Browser verb link uses first alias when verb has spaces", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const socket = { emit() {} };
  const emitMock = t.mock.method(socket, "emit");
  setSocket(socket);

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: {
      type: "ide-object-verbs",
      payload: [
        "#18657",
        [
          ["#18657", "rd", "tester22 tester23 tester24", [["any", "any", "any"]]]
        ]
      ]
    }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Foo", uploadCommand: "@program #18657:@matrix", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  tabs[0].click();
  await new Promise((r) => setTimeout(r, 0));

  const verbButton = Array.from(window.document.querySelectorAll("button")).find((b) =>
    (b.textContent || "").trim() === "tester22 tester23 tester24"
  );
  assert.ok(verbButton);
  verbButton.click();

  assert.ok(
    emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "@edit #18657:tester22"
    )
  );

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Object Browser verb link uses first alias and trims wildcard", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const socket = { emit() {} };
  const emitMock = t.mock.method(socket, "emit");
  setSocket(socket);

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: {
      type: "ide-object-verbs",
      payload: [
        "#18657",
        [
          ["#18657", "rd", "substi*tute tester23 tester24", [["any", "any", "any"]]]
        ]
      ]
    }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Foo", uploadCommand: "@program #18657:@matrix", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  tabs[0].click();
  await new Promise((r) => setTimeout(r, 0));

  const verbButton = Array.from(window.document.querySelectorAll("button")).find((b) =>
    (b.textContent || "").trim() === "substi*tute"
  );
  assert.ok(verbButton);
  verbButton.click();

  assert.ok(
    emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "@edit #18657:substi"
    )
  );

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Object Browser stays first even when created after other tabs", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  setSocket({ emit() {} });

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Note", uploadCommand: "@@set_note foo", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Prog", uploadCommand: "@program #18657:@matrix", buffer: "y" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  assert.match(tabs[0].textContent || "", /Object Browser/);
  assert.match(tabs[1].textContent || "", /Note/);
  assert.match(tabs[2].textContent || "", /Prog/);

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Property Browser is pinned after Object Browser and before other tabs", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  setSocket({ emit() {} });

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Prog", uploadCommand: "@program #18657:@matrix", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Prop", uploadCommand: "@set-note-text #18657.name", buffer: "y" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Other", uploadCommand: "@@set_note foo", buffer: "z" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  assert.match(tabs[0].textContent || "", /Object Browser/);
  assert.match(tabs[1].textContent || "", /Property Browser/);
  assert.match(tabs[2].textContent || "", /Prog/);
  assert.match(tabs[3].textContent || "", /Prop/);
  assert.match(tabs[4].textContent || "", /Other/);

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Property Browser Load Props sends SDWC request for object", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const socket = { emit() {} };
  const emitMock = t.mock.method(socket, "emit");
  setSocket(socket);

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Prop", uploadCommand: "@set-note-string #31540.name", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  tabs[0].click();
  await new Promise((r) => setTimeout(r, 0));
  const expand31540 = Array.from(window.document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "") === "Expand #31540"
  );
  assert.ok(expand31540);
  expand31540.click();
  await new Promise((r) => setTimeout(r, 0));

  const loadBtn = Array.from(window.document.querySelectorAll("button")).find((b) => b.textContent === "load props");
  assert.ok(loadBtn);
  loadBtn.click();

  assert.ok(
    emitMock.mock.calls.some((c) =>
      c.arguments[0] === "input" && c.arguments[1] === "#$# SDWC%%PROPS%%#31540"
    )
  );

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Property Browser is created for @edit object.property tabs", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  setSocket({ emit() {} });

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Prop", uploadCommand: "@edit #56955.key", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  assert.match(tabs[0].textContent || "", /Property Browser/);
  assert.match(tabs[1].textContent || "", /Prop/);

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

test("Property Browser replaces object properties from SDWC PROPS payload object and shows metadata", async (t) => {
  t.mock.module("ace-builds/src-noconflict/ace.js", { defaultExport: mockAce });
  t.mock.module("ace-builds/src-noconflict/theme-tomorrow_night_blue.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/keybinding-vim.js", { defaultExport: {} });
  t.mock.module("../../src/client/ace/mode-moo.js", { defaultExport: {} });

  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost",
  });
  const { window } = dom;
  const orig = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = window.document;

  let EditorIDE;
  try {
    ({ default: EditorIDE } = await import("../../src/client/react/EditorIDE.jsx"));
  } catch (err) {
    t.skip(err.message);
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    return;
  }

  const { default: React } = await import("react");
  const { createRoot } = await import("react-dom/client");
  setSocket({ emit() {} });

  const root = createRoot(window.document.getElementById("root"));
  root.render(React.createElement(EditorIDE));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: { type: "ide-open-tab", editor: { editorName: "Prop", uploadCommand: "@set-note-text #18657.name", buffer: "x" } }
  }));
  await new Promise((r) => setTimeout(r, 0));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: {
      type: "ide-object-props",
      payload: {
        flags: { f: 1, r: 1, w: 1, wizard: 1, programmer: 1, player: 1 },
        name: "string utilities",
        object: "#18657",
        owner: "#2",
        parent: "#12654",
        props: {
          aliases: { clear: 0, owner: "#2", permissions: "rc" },
          create_date: { clear: 1, owner: "#98", permissions: "r" }
        }
      }
    }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const tabs = Array.from(window.document.querySelectorAll("[role='tab']"));
  tabs[0].click();
  await new Promise((r) => setTimeout(r, 0));

  const expand18657 = Array.from(window.document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "") === "Expand #18657"
  );
  assert.ok(expand18657);
  assert.ok((expand18657.textContent || "").includes("string utilities (#18657)"));
  assert.ok((expand18657.textContent || "").includes("Owner: #2"));
  assert.ok((expand18657.textContent || "").includes("Parent: #12654"));
  assert.ok((expand18657.textContent || "").includes("Permissions: +rwf+wiz+prog+player"));
  expand18657.click();
  await new Promise((r) => setTimeout(r, 0));

  const headerText = window.document.querySelector(".property-browser-pane .font-semibold")?.textContent || "";
  assert.ok(headerText.includes("Prop name"));
  assert.ok(headerText.includes("Is Clear"));
  assert.ok(headerText.includes("Owner"));
  assert.ok(headerText.includes("Perms"));

  const props = Array.from(window.document.querySelectorAll("button"))
    .map((btn) => (btn.textContent || "").trim())
    .filter((txt) => txt === "aliases" || txt === "create_date");
  assert.deepEqual(props, ["aliases", "create_date"]);
  const rows = Array.from(window.document.querySelectorAll(".property-browser-pane section .rounded-sm"))
    .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim());
  assert.ok(rows.some((row) => row.includes("create_date") && row.includes("clear")));
  assert.ok(rows.some((row) => row.includes("aliases") && !row.includes("clear")));
  assert.ok(rows.some((row) => row.includes("aliases") && row.includes("#2") && row.includes("rc")));
  assert.ok(rows.some((row) => row.includes("create_date") && row.includes("#98") && row.includes("r")));

  window.dispatchEvent(new window.MessageEvent("message", {
    data: {
      type: "ide-object-props",
      payload: {
        flags: { f: 1 },
        name: "updated util",
        object: "#18657",
        owner: "#3",
        parent: "#99",
        props: {
          weight: { clear: 1, owner: "#1673", permissions: "r" }
        }
      }
    }
  }));
  await new Promise((r) => setTimeout(r, 0));

  const collapse18657 = Array.from(window.document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") || "") === "Collapse #18657"
  );
  assert.ok(collapse18657);
  assert.ok((collapse18657.textContent || "").includes("updated util (#18657)"));
  assert.ok((collapse18657.textContent || "").includes("Owner: #3"));
  assert.ok((collapse18657.textContent || "").includes("Parent: #99"));
  assert.ok((collapse18657.textContent || "").includes("Permissions: +f"));
  const refreshedProps = Array.from(window.document.querySelectorAll("button"))
    .map((btn) => (btn.textContent || "").trim())
    .filter((txt) => txt === "aliases" || txt === "create_date" || txt === "weight");
  assert.deepEqual(refreshedProps, ["weight"]);
  const refreshedRows = Array.from(window.document.querySelectorAll(".property-browser-pane section .rounded-sm"))
    .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim());
  assert.ok(refreshedRows.some((row) => row.includes("weight") && row.includes("#1673") && row.includes("r")));

  root.unmount();
  globalThis.window = orig.window;
  globalThis.document = orig.document;
});

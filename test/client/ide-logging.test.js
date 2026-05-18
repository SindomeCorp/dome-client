import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dome, setSocket, logger } from "../../src/client/b-variables.js";

const orig = { window: globalThis.window, document: globalThis.document, openIDE: dome.openIDE };

test("openIDE logs complete command info", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  dome.preferences = { edittheme: "dark" };
  setSocket({});

  window.open = () => ({
    closed: false,
    location: { pathname: "/editor/ide/" },
    postMessage() {},
    focus() {},
  });

  const logMock = t.mock.method(logger, "info");

  await import("../../src/client/ide.js");

  dome.openIDE({
    uploadCommand: "@program foo",
    editorName: "Test Tab",
    buffer: "This is some test data",
  });

  assert.equal(logMock.mock.calls.length, 1);
  assert.equal(logMock.mock.calls[0].arguments[0], "IDE editor invoked");
  assert.deepEqual(logMock.mock.calls[0].arguments[1], {
    uploadCommand: "@program foo",
    editorName: "Test Tab",
    buffer: "This is some test data",
    command: "@program",
    commandTarget: "foo",
  });

  t.after(() => {
    globalThis.window = orig.window;
    globalThis.document = orig.document;
    dome.openIDE = orig.openIDE;
    delete dome.preferences;
    logMock.mock.restore();
  });
});

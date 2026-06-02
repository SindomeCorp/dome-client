/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";

async function loadSave(t, { html = "<html></html>", css = "body{}", logger } = {}) {
  const named = t.mock.fn(() => (logger || { info() {}, error() {}, warn() {}, debug() {} }));
  const buildLogHtml = t.mock.fn(() => html);
  const getLogExportCss = t.mock.fn(() => css);
  const loggerMock = t.mock.module("../../src/logger.js", {
    namedExports: {
      named
    }
  });
  t.mock.module("../../src/shared/log-template.js", {
    namedExports: {
      buildLogHtml
    }
  });
  t.mock.module("../../src/services/log-export-style.js", {
    namedExports: {
      getLogExportCss
    }
  });
  const mod = await import(`../../src/controllers/save.js?c=${Date.now()}`);
  loggerMock.restore();
  return {
    ...mod,
    named,
    buildLogHtml,
    getLogExportCss
  };
}

test("save.log sets download headers and sends rendered html", async (t) => {
  const logger = { info: t.mock.fn(), error() {}, warn() {}, debug() {} };
  const html = "<html><body>ok</body></html>";
  const css = "body { color: #111; }";
  const { log, named, buildLogHtml, getLogExportCss } = await loadSave(t, { logger, html, css });

  const headers = new Map();
  const req = {
    ip: "127.0.0.1",
    params: { filename: "../../unsafe?.html" },
    body: { buffer: "line one" }
  };
  const res = {
    sent: null,
    setHeader(name, value) {
      headers.set(name, value);
    },
    send(value) {
      this.sent = value;
    }
  };

  log(req, res);

  assert.equal(headers.get("Content-disposition"), "attachment; filename=unsafe%3F.html");
  assert.equal(headers.get("Content-type"), "text/html");
  assert.equal(res.sent, html);
  assert.equal(buildLogHtml.mock.callCount(), 1);
  assert.deepEqual(buildLogHtml.mock.calls[0].arguments, ["line one", css]);
  assert.equal(getLogExportCss.mock.callCount(), 1);
  assert.equal(logger.info.mock.callCount(), 1);
  assert.equal(named.mock.callCount(), 1);
  assert.equal(named.mock.calls[0].arguments[0], "controllers/save");
  assert.equal(String(logger.info.mock.calls[0].arguments[0]), "generating log for 127.0.0.1");
});

test("save.log tolerates missing body buffer", async (t) => {
  const { log, buildLogHtml } = await loadSave(t);
  const req = {
    ip: "::1",
    params: { filename: "log.html" },
    body: undefined
  };
  const res = {
    setHeader() {},
    send() {}
  };

  log(req, res);

  assert.equal(buildLogHtml.mock.callCount(), 1);
  assert.equal(buildLogHtml.mock.calls[0].arguments[0], undefined);
});

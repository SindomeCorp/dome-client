/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";

import * as error from "../../src/middleware/error.js";
import logger from "../../src/logger.js";

function createRes() {
  return {
    statusCode: null,
    view: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, locals) {
      this.view = view;
      this.locals = locals;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test("notFound handles 404 error", () => {
  const req = { url: "/missing", header() { return ""; } };
  const res = createRes();
  const err = new Error("404");
  error.notFound(err, req, res, () => {});
  assert.equal(res.statusCode, 404);
  assert.equal(res.view, "errors/404");
  assert.deepEqual(res.locals, {
    title: "File Not Found",
    meta: { title: "Not Found", description: "The file requested doesn't exist.", keywords: "404" },
    error: err,
    url: req.url
  });
});

test("non-404 errors result in 500", () => {
  const req = { url: "/boom", header() { return ""; } };
  const res = createRes();
  const err = new Error("boom");
  error.errorHandler(err, req, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.view, "errors/500");
  assert.deepEqual(res.locals, {
    title: "Unexpected Error",
    meta: { title: "Unexpected Error", description: "Who really expects an error, anyway?", keywords: "500" },
    error: err,
    url: req.url
  });
});

test("errorHandler defaults to 404 for unknown routes", () => {
  const req = { url: "/unknown", header() { return ""; } };
  const res = createRes();
  error.errorHandler(null, req, res, () => {});
  assert.equal(res.statusCode, 404);
  assert.equal(res.view, "errors/404");
  assert.deepEqual(res.locals, {
    title: "File Not Found",
    meta: { title: "Not Found", description: "The file requested doesn't exist.", keywords: "404" },
    error: null,
    url: req.url
  });
});

test("json.errorHandler defaults to 404 when no error", () => {
  const req = {};
  const res = createRes();
  error.json.errorHandler(null, req, res, () => {});
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "File Not Found");
});

test("json.errorHandler uses provided error code", () => {
  const req = {};
  const res = createRes();
  const err = new Error("bad request");
  err.code = 400;
  error.json.errorHandler(err, req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { status: "error", err, message: "bad request" });
});

test("notFound passes unrelated errors and ordinary requests to the next handler", (t) => {
  const next = t.mock.fn();
  const req = { url: "/fixture", header() { return ""; } };
  const unrelated = new Error("fixture");
  const res = createRes();
  error.notFound(unrelated, req, res, next);
  error.notFound(undefined, req, res, next);
  assert.deepEqual(next.mock.calls.map(({ arguments: args }) => args), [[unrelated], []]);
  assert.equal(res.statusCode, null);
});

test("error metrics retain the most recent 20 responses per status", async () => {
  const { errorHandler, metrics } = await import("../../src/middleware/error.js?metrics-fixture");
  assert.deepEqual(metrics, {
    404: { count: 0, urls: [], ips: [] },
    500: { count: 0, urls: [], ips: [] }
  });
  const requests = Array.from({ length: 22 }, (_, index) => ({
    url: "/missing-" + index,
    header: (name) => name === "X-Forwarded-For" ? "192.0.2." + index : undefined
  }));
  for (const req of requests.slice(0, 20)) errorHandler(null, req, createRes(), () => {});
  assert.equal(metrics[404].urls.length, 20);
  for (const req of requests.slice(20)) errorHandler(null, req, createRes(), () => {});
  assert.deepEqual(metrics[404], {
    count: 22,
    urls: requests.slice(-20).map(({ url }) => url),
    ips: requests.slice(-20).map((req) => req.header("X-Forwarded-For"))
  });
});

test("middleware logs warnings and failures under its error namespace", async (t) => {
  const warn = t.mock.fn();
  const report = t.mock.fn();
  const child = t.mock.method(logger, "child", () => ({ warn, error: report }));
  const route = await import("../../src/middleware/error.js?logging-fixture");
  const req = { url: "/fixture", header() { return ""; } };
  const missing = new Error("404");
  const failure = new Error("fixture failure");
  const next = t.mock.fn();
  route.notFound(missing, req, createRes(), next);
  route.errorHandler(failure, req, createRes(), next);
  route.json.errorHandler(failure, req, createRes(), next);

  assert.deepEqual(child.mock.calls[0].arguments, [{ namespace: "middleware/error" }]);
  assert.deepEqual(warn.mock.calls[0].arguments, [missing]);
  assert.deepEqual(report.mock.calls.map(({ arguments: args }) => args), [
    ["Unexpected Error Encountered from /fixture", failure], [failure]
  ]);
});

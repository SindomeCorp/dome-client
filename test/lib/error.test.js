/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";

import * as error from "../../src/middleware/error.js";

function createRes() {
  return {
    statusCode: null,
    view: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view) {
      this.view = view;
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
});

test("non-404 errors result in 500", () => {
  const req = { url: "/boom", header() { return ""; } };
  const res = createRes();
  const err = new Error("boom");
  error.errorHandler(err, req, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.view, "errors/500");
});

test("errorHandler defaults to 404 for unknown routes", () => {
  const req = { url: "/unknown", header() { return ""; } };
  const res = createRes();
  error.errorHandler(null, req, res, () => {});
  assert.equal(res.statusCode, 404);
  assert.equal(res.view, "errors/404");
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
  assert.equal(res.body.message, "bad request");
});

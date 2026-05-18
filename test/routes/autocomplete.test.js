/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import config from "../../src/config/index.js";
import { ac, basic, clearCache } from "../../src/controllers/autocomplete.js";

test("ac caches results across calls", async (t) => {
  clearCache();
  const originalAutocomplete = { ...config.autocomplete };
  config.autocomplete = { user: "/tmp/user.txt" };
  const readFileMock = t.mock.method(fs.promises, "readFile", async () => "foo\nbar");

  try {
    const first = await ac("user");
    const second = await ac("user");
    assert.deepEqual(first, ["foo", "bar"]);
    assert.deepEqual(second, ["foo", "bar"]);
    assert.equal(readFileMock.mock.callCount(), 1);
  } finally {
    readFileMock.mock.restore();
    config.autocomplete = originalAutocomplete;
  }
});

test("ac returns empty array for unknown user type", async () => {
  clearCache();
  const originalAutocomplete = { ...config.autocomplete };
  config.autocomplete = {};

  try {
    const res = await ac("unknown");
    assert.deepEqual(res, []);
  } finally {
    config.autocomplete = originalAutocomplete;
  }
});

test("ac throws on read failure", async (t) => {
  clearCache();
  const originalAutocomplete = { ...config.autocomplete };
  config.autocomplete = { user: "/tmp/user.txt" };
  const readFileMock = t.mock.method(fs.promises, "readFile", async () => {
    throw new Error("boom");
  });

  try {
    await assert.rejects(ac("user"), /boom/);
    assert.equal(readFileMock.mock.callCount(), 1);
  } finally {
    readFileMock.mock.restore();
    config.autocomplete = originalAutocomplete;
  }
});

test("basic route returns autocomplete data", async (t) => {
  clearCache();
  const originalAutocomplete = { ...config.autocomplete };
  config.autocomplete = { user: "/tmp/user.txt" };
  const readFileMock = t.mock.method(fs.promises, "readFile", async () => "alpha\nbeta");

  try {
    const req = { params: { type: "user" } };
    let payload;
    const res = {
      json(v) {
        payload = v;
        return this;
      }
    };
    await basic(req, res);
    assert.deepEqual(payload, ["alpha", "beta"]);
    assert.equal(readFileMock.mock.callCount(), 1);
  } finally {
    readFileMock.mock.restore();
    config.autocomplete = originalAutocomplete;
  }
});

test("autocomplete route returns empty array for unknown type", async () => {
  clearCache();
  const originalAutocomplete = { ...config.autocomplete };
  config.autocomplete = {};

  try {
    const req = { params: { type: "unknown" } };
    let payload;
    const res = {
      json(v) {
        payload = v;
        return this;
      }
    };
    await basic(req, res);
    assert.deepEqual(payload, []);
  } finally {
    config.autocomplete = originalAutocomplete;
  }
});

test("autocomplete route handles errors", async (t) => {
  clearCache();
  const originalAutocomplete = { ...config.autocomplete };
  config.autocomplete = { user: "/tmp/user.txt" };
  const readFileMock = t.mock.method(fs.promises, "readFile", async () => {
    throw new Error("boom");
  });

  try {
    const req = { params: { type: "user" } };
    let statusCode = 200;
    let payload;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(v) {
        payload = v;
        return this;
      }
    };
    await basic(req, res);
    assert.equal(statusCode, 500);
    assert.deepEqual(payload, { error: "Failed to load autocomplete data" });
    assert.equal(readFileMock.mock.callCount(), 1);
  } finally {
    readFileMock.mock.restore();
    config.autocomplete = originalAutocomplete;
  }
});

test("ac returns empty array when autocomplete is disabled", async () => {
  clearCache();
  const originalAutocomplete = { ...config.autocomplete };
  config.autocomplete = { enabled: false, user: "/tmp/user.txt" };

  try {
    const res = await ac("user");
    assert.deepEqual(res, []);
  } finally {
    config.autocomplete = originalAutocomplete;
  }
});

test("basic route returns empty array when autocomplete is disabled", async () => {
  clearCache();
  const originalAutocomplete = { ...config.autocomplete };
  config.autocomplete = { enabled: false, user: "/tmp/user.txt" };

  try {
    const req = { params: { type: "user" } };
    let payload;
    const res = {
      json(v) {
        payload = v;
        return this;
      }
    };
    await basic(req, res);
    assert.deepEqual(payload, []);
  } finally {
    config.autocomplete = originalAutocomplete;
  }
});

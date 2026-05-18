/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import nock from "nock";
import config from "../../src/config/index.js";
import logger from "../../src/logger.js";

nock.disableNetConnect();

let importCounter = 0;
async function loadShorten() {
  const mod = await import(`../../src/services/shorten.js?cachebust=${importCounter++}`);
  return mod;
}

test("shortens and caches URLs", async t => {
  const shorten = await loadShorten();
  const longUrl = "http://example.com/" + "a".repeat(config.shorten.minimum + 10);
  const scope = nock(`http://${config.shorten.host}:${config.shorten.port}`)
    .post(config.shorten.path)
    .reply(200, { url: longUrl, key: "abc123" });
  t.after(() => nock.cleanAll());
  const first = await shorten.urls(longUrl);
  assert.equal(first, `http://${config.shorten.domain}/abc123`);
  const second = await shorten.urls(longUrl);
  assert.equal(second, `http://${config.shorten.domain}/abc123`);
  assert.ok(scope.isDone());
});

test("caps cache at configured limit", async t => {
  config.shorten.cacheLimit = 5;
  t.after(() => delete config.shorten.cacheLimit);
  const shorten = await loadShorten();
  let callCount = 0;
  const scope = nock(`http://${config.shorten.host}:${config.shorten.port}`)
    .post(config.shorten.path)
    .times(7)
    .reply(200, (uri, body) => {
      const decoded = decodeURIComponent(body.toString().replace("url=", ""));
      return { url: decoded, key: `${callCount++}` };
    });
  t.after(() => nock.cleanAll());
  const base = "http://example.com/";
  const tail = "x".repeat(config.shorten.minimum + 10);
  for (let i = 0; i < 6; i++) {
    const url = `${base}${i}${tail}`;
    const result = await shorten.urls(url);
    assert.ok(result.startsWith(`http://${config.shorten.domain}/`));
  }
  const firstUrl = `${base}0${tail}`;
  const again = await shorten.urls(firstUrl);
  assert.ok(again.startsWith(`http://${config.shorten.domain}/`));
  assert.equal(callCount, 7);
  scope.done();
});

test("does not shorten short URLs", async t => {
  const shorten = await loadShorten();
  const scope = nock(`http://${config.shorten.host}:${config.shorten.port}`)
    .post(config.shorten.path)
    .reply(200, { url: "x", key: "y" });
  t.after(() => nock.cleanAll());
  const input = "before http://short.com after";
  const result = await shorten.urls(input);
  assert.equal(result, input);
  assert.ok(!scope.isDone());
});

test("returns input when no URLs exist", async t => {
  const shorten = await loadShorten();
  const scope = nock(`http://${config.shorten.host}:${config.shorten.port}`)
    .post(config.shorten.path)
    .reply(200, { url: "x", key: "y" });
  t.after(() => nock.cleanAll());
  const text = "plain text without links";
  const result = await shorten.urls(text);
  assert.equal(result, text);
  assert.ok(!scope.isDone());
});

test("returns input on network failures", async t => {
  const cases = [
    {
      name: "network error",
      setup(t) {
        nock(`http://${config.shorten.host}:${config.shorten.port}`)
          .post(config.shorten.path)
          .replyWithError("boom");
        t.after(() => nock.cleanAll());
      },
      message: "url shortener connection failed: boom"
    },
    {
      name: "request timeout",
      setup(t, longUrl) {
        config.shorten.requestTimeout = 50;
        nock(`http://${config.shorten.host}:${config.shorten.port}`)
          .post(config.shorten.path)
          .delayBody(100)
          .reply(200, { url: longUrl, key: "late" });
        t.after(() => {
          nock.cleanAll();
          delete config.shorten.requestTimeout;
        });
      },
      message: "url shortener request timed out"
    },
    {
      name: "request exception",
      setup(t) {
        const mock = t.mock.method(globalThis, "fetch", () => {
          throw new Error("boom");
        });
        t.after(() => mock.mock.restore());
      },
      message: "url shortener connection failed: boom"
    }
  ];
  for (const c of cases) {
    await t.test(c.name, async t => {
      const shorten = await loadShorten();
      const longUrl = "http://example.com/" + c.name[0].repeat(config.shorten.minimum + 10);
      const warn = t.mock.method(logger, "warn");
      t.after(() => warn.mock.restore());
      c.setup(t, longUrl);
      const result = await shorten.urls(longUrl);
      assert.equal(result, longUrl);
      assert.equal(warn.mock.calls[0].arguments[0], c.message);
    });
  }
});

test("does not cache failed network responses", async t => {
  const shorten = await loadShorten();
  const longUrl = "http://example.com/" + "l".repeat(config.shorten.minimum + 10);
  const warn = t.mock.method(logger, "warn");
  const scope = nock(`http://${config.shorten.host}:${config.shorten.port}`)
    .post(config.shorten.path)
    .replyWithError("ouch")
    .post(config.shorten.path)
    .reply(200, { url: longUrl, key: "retry" });
  t.after(() => nock.cleanAll());
  t.after(() => warn.mock.restore());
  const first = await shorten.urls(longUrl);
  assert.equal(first, longUrl);
  assert.equal(warn.mock.calls[0].arguments[0], "url shortener connection failed: ouch");
  const second = await shorten.urls(longUrl);
  assert.equal(second, `http://${config.shorten.domain}/retry`);
  assert.ok(scope.isDone());
});

test("does not cache invalid responses", async t => {
  const shorten = await loadShorten();
  const longUrl = "http://example.com/" + "n".repeat(config.shorten.minimum + 10);
  const scope = nock(`http://${config.shorten.host}:${config.shorten.port}`)
    .post(config.shorten.path)
    .reply(200, { url: "http://example.com/bad", key: "zzz" })
    .post(config.shorten.path)
    .reply(200, { url: longUrl, key: "fine" });
  t.after(() => nock.cleanAll());
  const first = await shorten.urls(longUrl);
  assert.equal(first, longUrl);
  const second = await shorten.urls(longUrl);
  assert.equal(second, `http://${config.shorten.domain}/fine`);
  assert.ok(scope.isDone());
});

test("logs and returns input when matching fails", async t => {
  const shorten = await loadShorten();
  const warn = t.mock.method(logger, "warn");
  t.after(() => warn.mock.restore());
  const result = await shorten.urls(null);
  assert.equal(result, null);
  assert.equal(warn.mock.calls[0].arguments[0], "shortening urls failed");
});

test("continues shortening when one URL fails", async t => {
  const shorten = await loadShorten();
  const long1 = "http://example.com/" + "i".repeat(config.shorten.minimum + 10);
  const long2 = "http://example.com/" + "j".repeat(config.shorten.minimum + 10);
  const scope = nock(`http://${config.shorten.host}:${config.shorten.port}`)
    .post(config.shorten.path)
    .reply(200, { url: long1, key: "ok" })
    .post(config.shorten.path)
    .reply(200, { url: long1 });
  t.after(() => nock.cleanAll());
  const input = `${long1} ${long2}`;
  const result = await shorten.urls(input);
  assert.equal(result, `http://${config.shorten.domain}/ok ${long2}`);
  assert.ok(scope.isDone());
});

test("returns input and logs when data is invalid", async t => {
  const shorten = await loadShorten();
  const warn = t.mock.method(logger, "warn");
  t.after(() => warn.mock.restore());
  const input = {};
  const result = await shorten.urls(input);
  assert.equal(result, input);
  assert.equal(warn.mock.calls[0].arguments[0], "shortening urls failed");
});


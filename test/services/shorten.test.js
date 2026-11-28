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

test("public short link scheme follows useHttps while API transport stays HTTP", async t => {
  const original = config.shorten.useHttps;
  t.after(() => {
    config.shorten.useHttps = original;
    nock.cleanAll();
  });
  for (const [useHttps, protocol] of [[true, "https"], [false, "http"]]) {
    config.shorten.useHttps = useHttps;
    const shorten = await loadShorten();
    const longUrl = "https://example.com/" + "a".repeat(config.shorten.minimum + 10);
    const scope = nock(`http://${config.shorten.host}:${config.shorten.port}`)
      .post(config.shorten.path)
      .reply(200, { url: longUrl, key: "scheme123" });
    const expected = `${protocol}://${config.shorten.domain}/scheme123`;
    assert.equal(await shorten.urls(longUrl), expected);
    assert.equal(await shorten.urls(longUrl), expected);
    assert.ok(scope.isDone());
  }
});

test("shortens and caches URLs", async t => {
  const shorten = await loadShorten();
  const longUrl = "http://example.com/" + "a".repeat(config.shorten.minimum + 10);
  const scope = nock(`http://${config.shorten.host}:${config.shorten.port}`)
    .post(config.shorten.path)
    .reply(200, { url: longUrl, key: "abc123" });
  t.after(() => nock.cleanAll());
  const first = await shorten.urls(longUrl);
  assert.equal(first, `https://${config.shorten.domain}/abc123`);
  const second = await shorten.urls(longUrl);
  assert.equal(second, `https://${config.shorten.domain}/abc123`);
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
    .reply(200, async request => {
      const body = new URLSearchParams(await request.text());
      return { url: body.get("url"), key: `${callCount++}` };
    });
  t.after(() => nock.cleanAll());
  const base = "http://example.com/";
  const tail = "x".repeat(config.shorten.minimum + 10);
  for (let i = 0; i < 6; i++) {
    const url = `${base}${i}${tail}`;
    const result = await shorten.urls(url);
    assert.ok(result.startsWith(`https://${config.shorten.domain}/`));
  }
  const firstUrl = `${base}0${tail}`;
  const again = await shorten.urls(firstUrl);
  assert.ok(again.startsWith(`https://${config.shorten.domain}/`));
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
  const warn = t.mock.method(logger, "warn", () => {});
  const result = await shorten.urls(text);
  assert.equal(result, text);
  assert.equal(warn.mock.callCount(), 0);
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
      message: "url shortener connection failed: fetch failed"
    },
    {
      name: "request timeout",
      setup(t) {
        config.shorten.requestTimeout = 50;
        t.after(() => delete config.shorten.requestTimeout);
        t.mock.method(globalThis, "fetch", async (_url, { signal }) => {
          await new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
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
    await t.test(c.name, { timeout: 5000 }, async t => {
      const shorten = await loadShorten();
      const longUrl = "http://example.com/" + c.name[0].repeat(config.shorten.minimum + 10);
      const warn = t.mock.method(logger, "warn");
      t.after(() => warn.mock.restore());
      c.setup(t);
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
  assert.equal(warn.mock.calls[0].arguments[0], "url shortener connection failed: fetch failed");
  const second = await shorten.urls(longUrl);
  assert.equal(second, `https://${config.shorten.domain}/retry`);
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
  assert.equal(second, `https://${config.shorten.domain}/fine`);
  assert.ok(scope.isDone());
});

test("retains the original link until the API returns a successful result with a key", async (t) => {
  t.after(() => nock.cleanAll());
  const { urls } = await loadShorten();
  const url = "https://fixture.test/" + "p".repeat(85);
  const invalid = [
    [503, { url, key: "retry" }],
    [200, "null"],
    [200, { url }],
    [200, { url, key: "" }],
    [200, { url, key: "  " }],
    [200, { url, key: {} }]
  ];
  const warn = t.mock.method(logger, "warn", () => {});
  const api = nock(`http://${config.shorten.host}:${config.shorten.port}`);
  for (const [status, body] of invalid) api.post(config.shorten.path).reply(status, body);
  api.post(config.shorten.path).reply(200, { url, key: "fixed" });

  for (const [status] of invalid) assert.equal(await urls(url), url, "upstream status " + status);
  assert.equal(warn.mock.callCount(), 0);
  assert.equal(await urls(url), `https://${config.shorten.domain}/fixed`);
  api.done();
});

test("shortens complete URL matches in the original text when one is a prefix of another", async (t) => {
  t.after(() => nock.cleanAll());
  const { urls } = await loadShorten();
  const parent = "https://fixture.test/" + "a".repeat(85);
  const child = parent + "/child";
  const api = nock(`http://${config.shorten.host}:${config.shorten.port}`)
    .post(config.shorten.path, `url=${encodeURIComponent(parent)}`).reply(200, { url: parent, key: "parent" })
    .post(config.shorten.path, `url=${encodeURIComponent(child)}`).reply(200, { url: child, key: "child" });

  const domain = `https://${config.shorten.domain}`;
  assert.equal(await urls(parent), `${domain}/parent`);
  assert.equal(await urls(`${child}, ${parent}.`), `${domain}/child, ${domain}/parent.`);
  api.done();
});

test("a completed request releases its deadline and logs the URL mapping", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { urls } = await loadShorten();
  const url = "https://fixture.test/" + "b".repeat(85);
  const link = `https://${config.shorten.domain}/123`;
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ url, key: 123 }));
  const debug = t.mock.method(logger, "debug", () => {});

  assert.equal(await urls(url), link);
  assert.deepEqual(debug.mock.calls[0].arguments, [url + " >> " + link]);
  t.mock.timers.tick(3000);
  assert.equal(fetch.mock.calls[0].arguments[1].signal.aborted, false);
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
  assert.equal(result, `https://${config.shorten.domain}/ok ${long2}`);
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

test("the configured minimum is inclusive and requests use a form content type", async (t) => {
  const original = config.shorten.minimum;
  config.shorten.minimum = 45;
  t.after(() => { config.shorten.minimum = original; nock.cleanAll(); });
  const { urls } = await loadShorten();
  const root = "https://fixture.test/";
  const boundary = root.padEnd(45, "a");
  const below = root.padEnd(44, "b");
  const origin = `http://${config.shorten.host}:${config.shorten.port}`;
  const short = nock(origin).post(config.shorten.path, `url=${encodeURIComponent(below)}`)
    .reply(200, { url: below, key: "below" });
  const accepted = nock(origin).post(config.shorten.path, `url=${encodeURIComponent(boundary)}`)
    .matchHeader("Content-Type", "application/x-www-form-urlencoded")
    .reply(200, { url: boundary, key: "boundary" });

  assert.equal(await urls(below), below);
  assert.equal(short.isDone(), false);
  assert.equal(await urls(boundary), `https://${config.shorten.domain}/boundary`);
  accepted.done();
});

test("a cache hit refreshes recency without evicting at the configured capacity", async (t) => {
  const original = config.shorten.cacheLimit;
  config.shorten.cacheLimit = 2;
  t.after(() => { config.shorten.cacheLimit = original; nock.cleanAll(); });
  const { urls } = await loadShorten();
  const origin = `http://${config.shorten.host}:${config.shorten.port}`;
  const [a, b, c] = ["a", "b", "c"].map(label => "https://fixture.test/" + label.repeat(85));
  const requested = nock(origin);
  for (const [url, key] of [[a, "first"], [b, "second"], [c, "third"], [b, "second-again"]]) {
    requested.post(config.shorten.path, `url=${encodeURIComponent(url)}`).reply(200, { url, key });
  }
  const link = (key) => `https://${config.shorten.domain}/${key}`;

  assert.equal(await urls(a), link("first"));
  assert.equal(await urls(b), link("second"));
  assert.equal(await urls(a), link("first"));
  assert.equal(await urls(c), link("third"));
  assert.equal(await urls(a), link("first"));
  assert.equal(await urls(b), link("second-again"));
  requested.done();
});

test("an unexpected fetch rejection is logged and does not discard other matches", async (t) => {
  const { urls } = await loadShorten();
  const failed = "https://fixture.test/" + "a".repeat(85);
  const valid = "https://fixture.test/" + "b".repeat(85);
  const warn = t.mock.method(logger, "warn", () => {});
  t.mock.method(globalThis, "fetch", async (_endpoint, { body }) => {
    const url = new URLSearchParams(body).get("url");
    if (url === failed) return Promise.reject(undefined);
    return Response.json({ url, key: "worked" });
  });

  assert.equal(await urls(failed + " " + valid), failed + " https://" + config.shorten.domain + "/worked");
  assert.equal(warn.mock.calls[0].arguments[0], "failed to shorten url");
});

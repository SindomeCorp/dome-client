/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import qs from "node:querystring";
import md5 from "md5";
import nock from "nock";

async function load(t, remoteAuth = { enabled: true, host: "http://localhost:5550", path: "/session/authenticate/", remoteSecret: "XXX" }) {
  const configMock = t.mock.module("../../src/config/index.js", { defaultExport: { remoteAuth } });
  const loggerMock = t.mock.module("../../src/logger.js", {
    namedExports: {
      named: () => ({ info() {}, error() {}, warn() {}, debug() {} })
    }
  });
  const [{ login }, { setupAuth }] = await Promise.all([
    import(`../../src/controllers/auth.js?c=${Date.now()}`),
    import("../helpers/auth.js")
  ]);
  configMock.restore();
  loggerMock.restore();
  return { login, setupAuth };
}

test("assigns session user on success", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: { status: "ok", user: { perms: [1] } }
  });
  login(req, res);
  await done;
  scope.done();
  assert.deepEqual(req.session.user, { perms: [1], chars: [] });
  assert.strictEqual(redirect.url, "/");
});

test("handles JSON parse errors", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: "not json"
  });
  login(req, res);
  await done;
  scope.done();
  assert.match(req.session.error, /Unexpected token/);
  assert.strictEqual(redirect.url, "/");
});

test("redirects to first char when gogogo set", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: {
      status: "ok",
      user: { perms: [1], chars: [ { name: "hero" } ] }
    },
    body: { email: "a", pass: "b", gogogo: true }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(redirect.url, "/?auto=hero");
});

test("ignores null char entries from remote auth payload", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: {
      status: "ok",
      user: { perms: [1], chars: [null, { name: "hero" }] }
    },
    body: { email: "a", pass: "b", gogogo: true }
  });
  login(req, res);
  await done;
  scope.done();
  assert.deepEqual(req.session.user.chars, [{ name: "hero" }]);
  assert.strictEqual(redirect.url, "/?auto=hero");
});

test("return parameter overrides destination", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: {
      status: "ok",
      user: { perms: [1], chars: [ { name: "hero" } ] }
    },
    body: { email: "a", pass: "b", gogogo: true, return: "/next" }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(redirect.url, "/next");
});

test("return parameter is ignored when it is not an absolute path", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: {
      status: "ok",
      user: { perms: [1], chars: [{ name: "hero" }] }
    },
    body: { email: "a", pass: "b", gogogo: true, return: "https://evil.example/next" }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(redirect.url, "/?auto=hero");
});

test("ok status with null user payload is rejected", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: { status: "ok", user: null }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(req.session.error, "Unexpected error occurred while authenticating user against website.");
  assert.strictEqual(redirect.url, "/");
});

test("non-ok status without message uses fallback error", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: { status: "error" }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(req.session.error, "Unexpected error occurred while authenticating user against website.");
  assert.strictEqual(redirect.url, "/");
});

test("builds request options when host includes port", async t => {
  const remoteAuth = { enabled: true, host: "http://localhost:8080", path: "/session/authenticate/", remoteSecret: "sekret" };
  const { login, setupAuth } = await load(t, remoteAuth);
  const expectedBody = qs.stringify({
    email: "a",
    pass: "b",
    signature: md5("sekret")
  });
  const scope = nock("http://localhost:8080")
    .matchHeader("Content-Type", "application/x-www-form-urlencoded")
    .post("/session/authenticate/", expectedBody)
    .reply(200, { status: "ok", user: { perms: [] } });
  const { req, res, redirect, done } = setupAuth();
  login(req, res);
  await done;
  scope.done();
  assert.deepEqual(req.session.user, { perms: [], chars: [] });
  assert.strictEqual(redirect.url, "/");
});

test("builds request options for https host", async t => {
  const remoteAuth = { enabled: true, host: "https://localhost:9090", path: "/session/authenticate/", remoteSecret: "sekret" };
  const { login, setupAuth } = await load(t, remoteAuth);
  const expectedBody = qs.stringify({
    email: "a",
    pass: "b",
    signature: md5("sekret")
  });
  const scope = nock("https://localhost:9090")
    .matchHeader("Content-Type", "application/x-www-form-urlencoded")
    .post("/session/authenticate/", expectedBody)
    .reply(200, { status: "ok", user: { perms: [] } });
  const { req, res, redirect, done } = setupAuth();
  login(req, res);
  await done;
  scope.done();
  assert.deepEqual(req.session.user, { perms: [], chars: [] });
  assert.strictEqual(redirect.url, "/");
});

test("sets session error on remote error status", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: { status: "error", message: "fail" }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(req.session.error, "fail");
  assert.strictEqual(redirect.url, "/");
});

test("handles response error", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({ error: "fail" });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(req.session.error, "fail");
  assert.strictEqual(redirect.url, "/");
});

test("handles request error", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({ error: "boom" });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(req.session.error, "boom");
  assert.strictEqual(redirect.url, "/");
});

test("rejects login when website auth is disabled", async t => {
  const { login, setupAuth } = await load(t, {
    enabled: false,
    host: "http://localhost:5550",
    path: "/session/authenticate/",
    remoteSecret: "XXX"
  });
  const { req, res, redirect } = setupAuth();
  await login(req, res);
  assert.strictEqual(req.session.error, "Website authentication is disabled.");
  assert.strictEqual(redirect.url, "/");
});

test("handles non-object auth payload as authentication failure", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: 7
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(req.session.error, "Unexpected error occurred while authenticating user against website.");
  assert.strictEqual(redirect.url, "/");
});

test("rejects ok status with malformed user payload", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: { status: "ok", user: "unexpected" }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(req.session.error, "Unexpected error occurred while authenticating user against website.");
  assert.strictEqual(redirect.url, "/");
});

test("rejects payload with ok status but missing user object", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: { status: "ok" }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(req.session.error, "Unexpected error occurred while authenticating user against website.");
  assert.strictEqual(redirect.url, "/");
});

test("rejects payload with non-string status", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: { status: 123, user: { perms: [1] } }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(req.session.error, "Unexpected error occurred while authenticating user against website.");
  assert.strictEqual(redirect.url, "/");
});

test("rejects payload with non-string message on non-ok status", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: { status: "error", message: 500 }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(req.session.error, "Unexpected error occurred while authenticating user against website.");
  assert.strictEqual(redirect.url, "/");
});

for (const [name, response] of [
  ["rejects array payload", []],
  ["rejects null payload", null],
  ["rejects payload with array user on ok status", { status: "ok", user: [] }],
  ["rejects payload with numeric user on ok status", { status: "ok", user: 9 }],
  ["rejects payload with null message on non-ok status", { status: "error", message: null }],
  ["rejects payload with object message on non-ok status", { status: "error", message: { text: "bad" } }]
]) {
  test(name, async t => {
    const { login, setupAuth } = await load(t);
    const { req, res, scope, redirect, done } = setupAuth({
      status: 200,
      response
    });
    login(req, res);
    await done;
    scope.done();
    assert.strictEqual(req.session.error, "Unexpected error occurred while authenticating user against website.");
    assert.strictEqual(redirect.url, "/");
  });
}

test("gogogo does not auto-redirect when first char has empty name", async t => {
  const { login, setupAuth } = await load(t);
  const { req, res, scope, redirect, done } = setupAuth({
    status: 200,
    response: {
      status: "ok",
      user: { perms: [1], chars: [{ name: "" }, { name: "hero" }] }
    },
    body: { email: "a", pass: "b", gogogo: true }
  });
  login(req, res);
  await done;
  scope.done();
  assert.strictEqual(redirect.url, "/?auto=hero");
});

test("handles missing request body fields safely", async t => {
  const remoteAuth = { enabled: true, host: "http://localhost:8081", path: "/session/authenticate/", remoteSecret: "sekret" };
  const { login, setupAuth } = await load(t, remoteAuth);
  const expectedBody = qs.stringify({
    email: undefined,
    pass: undefined,
    signature: md5("sekret")
  });
  const scope = nock("http://localhost:8081")
    .matchHeader("Content-Type", "application/x-www-form-urlencoded")
    .post("/session/authenticate/", expectedBody)
    .reply(200, { status: "ok", user: { perms: [] } });
  const { req, res, redirect, done } = setupAuth({ body: {} });
  login(req, res);
  await done;
  scope.done();
  assert.deepEqual(req.session.user, { perms: [], chars: [] });
  assert.strictEqual(redirect.url, "/");
});

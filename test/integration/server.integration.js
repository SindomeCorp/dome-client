/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import nock from "nock";
import { io as createSocketClient } from "socket.io-client";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(assertion, { timeoutMs = 2500, intervalMs = 100 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await assertion();
      return;
    } catch {
      await wait(intervalMs);
    }
  }
  await assertion();
}

async function bootServer(t, {
  remoteAuth = { enabled: true, host: "http://remoteauth.test", path: "/session/authenticate/", remoteSecret: "sekret" },
  status = { serviceUrl: "http://status.test/moo/status/" },
  node = {},
  moo = {},
  website = {},
  autocomplete = {},
  acmeWebroot,
  screensController
} = {}) {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const config = {
    node: {
      mode: "test",
      port: 0,
      socketUrl: "",
      socketUrlSSL: "",
      socketProxied: false,
      multiMud: false,
      poweredBy: "Dome Client",
      session: {
        secret: "integration-test-secret"
      }
    },
    moo: {
      name: "Integration MUD",
      host: "127.0.0.1",
      port: 4444
    },
    website: {
      signupUrl: ""
    },
    guest: {
      connectCommand: "connect guest"
    },
    autocomplete: {
      enabled: false,
      p: "data/autocomplete/player.txt",
      j: "data/autocomplete/justice.txt",
      a: "data/autocomplete/agent.txt",
      c: "data/autocomplete/creator.txt",
      w: "data/autocomplete/watcher.txt",
      o: "data/autocomplete/guest.txt"
    },
    editor: {
      localSaveNodeMaxLines: 200,
      localSaveNodeAdminMaxLines: 800,
      localSaveNoteMaxLines: 20,
      ideEditOpenParent: false,
      ideVmsNoteEnabled: false
    },
    shorten: {
      enabled: false,
      host: "localhost",
      port: 5549,
      path: "/interface/v1/shorten/",
      domain: "",
      minimum: 50
    },
    remoteAuth,
    status
  };
  Object.assign(config.node, node);
  Object.assign(config.moo, moo);
  Object.assign(config.website, website);
  Object.assign(config.autocomplete, autocomplete);

  const originalAcmeWebroot = process.env.ACME_WEBROOT;
  if (typeof acmeWebroot === "string") {
    process.env.ACME_WEBROOT = acmeWebroot;
  }

  moduleMock("../../src/config/index.js", { defaultExport: config });
  moduleMock("../../src/logger.js", {
    namedExports: {
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      })
    }
  });
  moduleMock("../../src/controllers/socket.js", {
    namedExports: {
      connection() {},
      error() {},
    }
  });
  if (screensController) {
    moduleMock("../../src/controllers/screens.js", {
      namedExports: screensController
    });
  }

  const { start, stop } = await import(`../../src/server.js?integration=${Date.now()}`);
  const runtime = await start({ port: 0, ip: "127.0.0.1", skipBuild: true });
  t.after(async () => {
    if (typeof acmeWebroot === "string") {
      if (originalAcmeWebroot === undefined) {
        delete process.env.ACME_WEBROOT;
      } else {
        process.env.ACME_WEBROOT = originalAcmeWebroot;
      }
    }
    await stop();
    t.mock.restoreAll();
    nock.cleanAll();
    nock.enableNetConnect();
  });
  return {
    runtime,
    baseUrl: `http://127.0.0.1:${runtime.http.port}`
  };
}

test("integration: serves routes and accepts socket.io connections", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);

  const home = await http.get("/").expect(200);
  assert.match(home.headers["content-type"] || "", /text\/html/);

  const health = await http.get("/health/").expect(200);
  assert.equal(typeof health.body.currentlyConnected, "number");
  assert.equal(typeof health.body.currentRss, "number");

  await new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000
    });
    socket.on("connect", () => {
      socket.disconnect();
      resolve();
    });
    socket.on("connect_error", (err) => {
      reject(err);
    });
  });
});

test("integration: website login sets session and redirects", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [{ name: "hero" }] } });

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const agent = request.agent(baseUrl);

  const loginResponse = await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "secret" })
    .expect(302);

  assert.equal(loginResponse.headers.location, "/");
  assert.ok(Array.isArray(loginResponse.headers["set-cookie"]));
  assert.ok(loginResponse.headers["set-cookie"].length > 0);

  const home = await agent.get("/").expect(200);
  assert.match(home.text, /Play As/i);
});

test("integration: unauthenticated session does not render play-as controls", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const home = await request(baseUrl).get("/").expect(200);
  assert.doesNotMatch(home.text, /Play As/i);
  assert.match(home.text, /Website Login/i);
});

test("integration: connect page renders for both get and post", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  const getRes = await http.get("/").expect(200);
  const postRes = await http.post("/").expect(200);
  assert.match(getRes.text, /Connect as a Guest/i);
  assert.match(postRes.text, /Connect as a Guest/i);
});

test("integration: player client route renders and includes status health anchors", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const res = await request(baseUrl).get("/player-client/").expect(200);
  assert.match(res.text, /id="lineBuffer"/);
  assert.match(res.text, /id="gameHealth"/);
  assert.match(res.text, /id="gameHealthDetail"/);
});

test("integration: player client shows health widget and link when status service is configured", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const serviceUrl = "http://status.test/moo/status/";
  const { baseUrl } = await bootServer(t, {
    status: { serviceUrl }
  });
  const res = await request(baseUrl).get("/player-client/").expect(200);
  assert.match(res.text, /id="gameHealth"/);
  assert.match(res.text, /id="gameHealthDetail"/);
  assert.match(res.text, /href="http:\/\/status\.test\/moo\/status\/"/);
});

test("integration: game owner questions route is not found in default mode", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t, {
    node: { multiMud: false }
  });
  await request(baseUrl).get("/game-owner-questions/").expect(404);
});

test("integration: editor route resolves known types and falls back unknown to basic", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);

  const ide = await http.get("/editor/ide/").expect(200);
  assert.match(ide.text, /id="root"/);
  assert.match(ide.text, /ide-editor-window\.js/);

  const verb = await http.get("/editor/verb/").expect(200);
  assert.match(verb.text, /id="verb-editor-holder"/);

  const note = await http.get("/editor/note-viewer/").expect(200);
  assert.match(note.text, /class="editor note-popup"/);

  const fallback = await http.get("/editor/not-a-real-editor/").expect(200);
  assert.match(fallback.text, /class="basic-textarea"/);
  assert.doesNotMatch(fallback.text, /id="verb-editor-holder"/);

  const readonly = await http.get("/editor/basic-readonly/").expect(200);
  assert.match(readonly.text, /READ-ONLY/);
});

test("integration: editor theme query applies allowed theme and rejects unknown theme", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);

  const ideAllowed = await http.get("/editor/ide/?et=monokai").expect(200);
  assert.match(ideAllowed.text, /data-editor-theme="monokai"/);

  const ideFallback = await http.get("/editor/ide/?et=not-a-theme").expect(200);
  assert.match(ideFallback.text, /data-editor-theme="twilight"/);

  const verbAllowed = await http.get("/editor/verb/?et=terminal").expect(200);
  assert.match(verbAllowed.text, /data-editor-theme="terminal"/);

  const verbFallback = await http.get("/editor/verb/?et=bad-theme").expect(200);
  assert.match(verbFallback.text, /data-editor-theme="twilight"/);
});

test("integration: autocomplete endpoint returns empty list when disabled", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t, {
    autocomplete: {
      enabled: false
    }
  });
  const http = request(baseUrl);
  const known = await http.get("/ac/p").expect(200);
  assert.deepEqual(known.body, []);

  const unknown = await http.get("/ac/unknown").expect(200);
  assert.deepEqual(unknown.body, []);
});

test("integration: autocomplete endpoint returns JSON content type", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const res = await request(baseUrl).get("/ac/p").expect(200);
  assert.match(res.headers["content-type"] || "", /application\/json/);
});

test("integration: acme challenge route returns 404 for missing token", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  await http.get("/.well-known/acme-challenge/missing-token").expect(404);
});

test("integration: website login session state is isolated per agent", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [{ name: "hero" }] } });
  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "error", message: "Invalid credentials" });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const agentA = request.agent(baseUrl);
  const agentB = request.agent(baseUrl);

  await agentA
    .post("/website-login/")
    .type("form")
    .send({ email: "a@test", pass: "secret" })
    .expect(302);
  await agentB
    .post("/website-login/")
    .type("form")
    .send({ email: "b@test", pass: "bad" })
    .expect(302);

  const homeA = await agentA.get("/").expect(200);
  const homeB = await agentB.get("/").expect(200);
  assert.match(homeA.text, /Play As/i);
  assert.match(homeB.text, /Invalid credentials/i);
});

test("integration: website login gogogo redirects to first character", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [{ name: "hero" }, { name: "other" }] } });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const response = await request(baseUrl)
    .post("/website-login/")
    .type("form")
    .send({ email: "a@test", pass: "secret", gogogo: "true" })
    .expect(302);
  assert.equal(response.headers.location, "/?auto=hero");
});

test("integration: website login gogogo with no chars does not auto-route", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [] } });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const response = await request(baseUrl)
    .post("/website-login/")
    .type("form")
    .send({ email: "a@test", pass: "secret", gogogo: "true" })
    .expect(302);
  assert.equal(response.headers.location, "/");
});

test("integration: website login return parameter honors safe path and ignores unsafe path", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [{ name: "hero" }] } });
  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [{ name: "hero" }] } });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);

  const safe = await http
    .post("/website-login/")
    .type("form")
    .send({ email: "a@test", pass: "secret", return: "/safe/path" })
    .expect(302);
  assert.equal(safe.headers.location, "/safe/path");

  const unsafe = await http
    .post("/website-login/")
    .type("form")
    .send({ email: "a@test", pass: "secret", return: "https://evil.example/redirect" })
    .expect(302);
  assert.equal(unsafe.headers.location, "/");
});

test("integration: website login return takes precedence over gogogo", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [{ name: "hero" }] } });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const response = await request(baseUrl)
    .post("/website-login/")
    .type("form")
    .send({ email: "a@test", pass: "secret", gogogo: "true", return: "/priority-path" })
    .expect(302);
  assert.equal(response.headers.location, "/priority-path");
});

test("integration: status endpoint reflects upstream status service", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  const expectedStatus = {
    message: "moo ok",
    cpu: 11,
    memory: 22,
    checked: Date.now(),
    users: 33,
    interval: 15,
    state: "OK"
  };

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, expectedStatus, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const { refreshStatus } = await import("../../src/controllers/status.js");
  const http = request(baseUrl);
  await refreshStatus();
  const res = await http.get("/moo/status/").expect(200);
  assert.equal(res.body.state, "OK");
  assert.equal(res.body.message, expectedStatus.message);
});

test("integration: status endpoint response schema stays stable", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  const expectedStatus = {
    message: "schema-check",
    cpu: 12,
    memory: 3456,
    checked: Date.now(),
    users: 78,
    interval: 15,
    state: "OK"
  };

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, expectedStatus, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const { refreshStatus } = await import("../../src/controllers/status.js");
  const http = request(baseUrl);
  await refreshStatus();
  const res = await http.get("/moo/status/").expect(200);

  assert.equal(typeof res.body.message, "string");
  assert.equal(typeof res.body.cpu, "number");
  assert.equal(typeof res.body.memory, "number");
  assert.equal(typeof res.body.checked, "number");
  assert.equal(typeof res.body.users, "number");
  assert.equal(typeof res.body.interval, "number");
  assert.equal(typeof res.body.state, "string");
});

test("integration: status endpoint maps upstream failures to degraded status", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(503, "service down", { "Content-Type": "text/plain" });

  const { baseUrl } = await bootServer(t);
  const { refreshStatus } = await import("../../src/controllers/status.js");
  const http = request(baseUrl);
  await refreshStatus();
  const res = await http.get("/moo/status/").expect(200);
  assert.equal(res.body.state, "SITE_DOWN");
  assert.match(res.body.message || "", /status service/i);
});

test("integration: status endpoint maps non-json upstream response to degraded status", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, "<html>not json</html>", { "Content-Type": "text/html" });

  const { baseUrl } = await bootServer(t);
  const { refreshStatus } = await import("../../src/controllers/status.js");
  const http = request(baseUrl);
  await refreshStatus();
  const res = await http.get("/moo/status/").expect(200);
  assert.equal(res.body.state, "SITE_DOWN");
  assert.match(res.body.message || "", /status service/i);
});

test("integration: status endpoint maps invalid-json upstream response to degraded status", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, "{bad-json", { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const { refreshStatus } = await import("../../src/controllers/status.js");
  const http = request(baseUrl);
  await refreshStatus();
  const res = await http.get("/moo/status/").expect(200);
  assert.equal(res.body.state, "SITE_DOWN");
  assert.match(res.body.message || "", /status service/i);
});

test("integration: status endpoint transitions ok to degraded and recovers to ok", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .get("/moo/status/")
    .reply(200, { message: "ok", cpu: 1, memory: 2, checked: Date.now(), users: 3, interval: 15, state: "OK" }, { "Content-Type": "application/json" })
    .get("/moo/status/")
    .reply(503, "down", { "Content-Type": "text/plain" })
    .get("/moo/status/")
    .reply(200, { message: "ok-again", cpu: 4, memory: 5, checked: Date.now(), users: 6, interval: 15, state: "OK" }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const { refreshStatus } = await import("../../src/controllers/status.js");
  const http = request(baseUrl);

  await refreshStatus();
  const first = await http.get("/moo/status/").expect(200);
  assert.equal(first.body.state, "OK");
  assert.equal(first.body.message, "ok");

  await refreshStatus();
  const second = await http.get("/moo/status/").expect(200);
  assert.equal(second.body.state, "SITE_DOWN");

  await refreshStatus();
  const third = await http.get("/moo/status/").expect(200);
  assert.equal(third.body.state, "OK");
  assert.equal(third.body.message, "ok-again");
});

test("integration: website login failure sets session error and redirects", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "error", message: "Invalid credentials" });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const agent = request.agent(baseUrl);

  const loginResponse = await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "wrong-pass" })
    .expect(302);
  assert.equal(loginResponse.headers.location, "/");

  const home = await agent.get("/").expect(200);
  assert.match(home.text, /Invalid credentials/);
});

test("integration: website login error is shown once and then cleared from session", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "error", message: "Invalid credentials" });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const agent = request.agent(baseUrl);
  await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "bad" })
    .expect(302);

  const first = await agent.get("/").expect(200);
  assert.match(first.text, /Invalid credentials/i);

  const second = await agent.get("/").expect(200);
  assert.doesNotMatch(second.text, /Invalid credentials/i);
});

test("integration: health connection count reflects live socket clients", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  const sockets = [];

  await Promise.all([0, 1].map(() => new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000
    });
    sockets.push(socket);
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
  })));

  await waitFor(async () => {
    const health = await http.get("/health/").expect(200);
    assert.ok(health.body.currentlyConnected >= 2);
  });

  sockets.forEach((socket) => socket.disconnect());
  await waitFor(async () => {
    const health = await http.get("/health/").expect(200);
    assert.ok(health.body.currentlyConnected <= 1);
  });
});

test("integration: health endpoint response schema stays stable", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  const res = await http.get("/health/").expect(200);

  assert.equal(typeof res.body.currentlyConnected, "number");
  assert.equal(typeof res.body.currentRss, "number");
  assert.equal(typeof res.body.currentHeapUsed, "number");
  assert.equal(typeof res.body.cpuLoad, "object");
  assert.equal(typeof res.body.lastRestart, "string");
  assert.ok(res.body.currentlyConnected >= 0);
  assert.ok(res.body.currentRss >= 0);
  assert.ok(res.body.currentHeapUsed >= 0);
  assert.equal(typeof res.body.cpuLoad["1m"], "number");
  assert.equal(typeof res.body.cpuLoad["5m"], "number");
  assert.equal(typeof res.body.cpuLoad["15m"], "number");
  assert.ok(!Number.isNaN(Date.parse(res.body.lastRestart)));
});

test("integration: website login network failure sets session error and redirects", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .replyWithError("upstream unavailable");
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const agent = request.agent(baseUrl);

  const loginResponse = await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "secret" })
    .expect(302);
  assert.equal(loginResponse.headers.location, "/");

  const home = await agent.get("/").expect(200);
  assert.match(home.text, /upstream unavailable/i);
});

test("integration: website login timeout-like upstream failure sets session error and redirects", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .replyWithError({ code: "ETIMEDOUT", message: "request timed out" });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const agent = request.agent(baseUrl);

  const loginResponse = await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "secret" })
    .expect(302);
  assert.equal(loginResponse.headers.location, "/");

  const home = await agent.get("/").expect(200);
  assert.doesNotMatch(home.text, /Play As/i);
});

test("integration: website login malformed upstream responses set session errors and redirect", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, "<html>not-json</html>", { "Content-Type": "text/html" });
  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: "not-an-object" });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const agent = request.agent(baseUrl);

  const nonJson = await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "secret" })
    .expect(302);
  assert.equal(nonJson.headers.location, "/");
  const nonJsonHome = await agent.get("/").expect(200);
  assert.match(nonJsonHome.text, /(unexpected token|json|exception|authenticating)/i);

  const malformedUser = await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "secret" })
    .expect(302);
  assert.equal(malformedUser.headers.location, "/");
  const malformedHome = await agent.get("/").expect(200);
  assert.match(malformedHome.text, /Connect/i);
});

test("integration: website login session persists across socket connect-disconnect flow", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [{ name: "hero" }] } });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const agent = request.agent(baseUrl);

  await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "secret" })
    .expect(302);
  const before = await agent.get("/").expect(200);
  assert.match(before.text, /Play As/i);

  await new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000
    });
    socket.on("connect_error", reject);
    socket.on("error", reject);
    socket.on("connect", () => {
      socket.once("disconnect", resolve);
      socket.disconnect();
    });
  });

  const after = await agent.get("/").expect(200);
  assert.match(after.text, /Play As/i);
});

test("integration: repeated socket reconnect cycles do not leak health connection count", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);

  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve, reject) => {
      const socket = createSocketClient(baseUrl, {
        transports: ["websocket"],
        reconnection: false,
        timeout: 2000
      });
      socket.on("connect_error", reject);
      socket.on("error", reject);
      socket.on("connect", () => {
        socket.once("disconnect", resolve);
        socket.disconnect();
      });
    });
  }

  await waitFor(async () => {
    const health = await http.get("/health/").expect(200);
    assert.ok(health.body.currentlyConnected <= 1);
  });
});

test("integration: concurrent reconnect storm settles to baseline connection count", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);

  await Promise.all(Array.from({ length: 10 }).map(() => new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000
    });
    socket.on("connect_error", reject);
    socket.on("error", reject);
    socket.on("connect", () => {
      socket.once("disconnect", resolve);
      socket.disconnect();
    });
  })));

  await waitFor(async () => {
    const health = await http.get("/health/").expect(200);
    assert.ok(health.body.currentlyConnected <= 1);
  });
});

test("integration: status endpoint remains stable between refreshes and only changes after refresh", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .get("/moo/status/")
    .reply(200, { message: "phase-1", cpu: 1, memory: 2, checked: Date.now(), users: 3, interval: 15, state: "OK" }, { "Content-Type": "application/json" })
    .get("/moo/status/")
    .reply(200, { message: "phase-2", cpu: 4, memory: 5, checked: Date.now(), users: 6, interval: 15, state: "OK" }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const { refreshStatus } = await import("../../src/controllers/status.js");
  const http = request(baseUrl);

  await refreshStatus();
  const first = await http.get("/moo/status/").expect(200);
  assert.equal(first.body.message, "phase-1");

  const stillFirst = await http.get("/moo/status/").expect(200);
  assert.equal(stillFirst.body.message, "phase-1");

  await refreshStatus();
  const second = await http.get("/moo/status/").expect(200);
  assert.equal(second.body.message, "phase-2");
});

test("integration: static assets and security headers baseline", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);

  const home = await http.get("/").expect(200);
  assert.equal(home.headers["x-powered-by"], undefined);

  const css = await http.get("/css/client.css").expect(200);
  assert.match(css.headers["content-type"] || "", /text\/css/);
  assert.ok((css.text || "").length > 100);

  const js = await http.get("/js/player-client.js").expect(200);
  assert.match(js.headers["content-type"] || "", /(javascript|ecmascript)/i);
});

test("integration: core routes keep consistent baseline security headers", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);

  const home = await http.get("/").expect(200);
  const player = await http.get("/player-client/").expect(200);
  const health = await http.get("/health/").expect(200);
  const status = await http.get("/moo/status/").expect(200);

  assert.equal(home.headers["x-powered-by"], undefined);
  assert.equal(player.headers["x-powered-by"], undefined);
  assert.equal(health.headers["x-powered-by"], undefined);
  assert.equal(status.headers["x-powered-by"], undefined);

  const contentTypeOptions = home.headers["x-content-type-options"];
  assert.equal(player.headers["x-content-type-options"], contentTypeOptions);
  assert.equal(health.headers["x-content-type-options"], contentTypeOptions);
  assert.equal(status.headers["x-content-type-options"], contentTypeOptions);
});

test("integration: website login sets expected session cookie attributes", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [{ name: "hero" }] } });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  const response = await http
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "secret" })
    .expect(302);

  const cookies = response.headers["set-cookie"] || [];
  assert.ok(cookies.length > 0);
  assert.ok(cookies.some((cookie) => cookie.includes("HttpOnly")));
  assert.ok(cookies.some((cookie) => cookie.includes("Path=/")));
});

test("integration: website login is blocked when remote auth is disabled", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t, {
    remoteAuth: {
      enabled: false,
      host: "http://remoteauth.test",
      path: "/session/authenticate/",
      remoteSecret: "sekret"
    }
  });
  const agent = request.agent(baseUrl);

  const response = await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "secret" })
    .expect(302);
  assert.equal(response.headers.location, "/");

  await agent.get("/").expect(200);
});

test("integration: save log endpoint returns downloadable html and sanitizes filename", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  const payload = "<span class=\"line\">hello</span>";

  const response = await http
    .post("/save/%2E%2E%2F%2E%2E%2Funsafe-name.html")
    .type("form")
    .send({ buffer: payload })
    .expect(200);

  assert.match(response.headers["content-type"] || "", /text\/html/);
  assert.match(response.headers["content-disposition"] || "", /filename=unsafe-name\.html/);
  assert.match(response.text, /<title>Web Client Buffer<\/title>/);
  assert.match(response.text, /<div id="lineBuffer">/);
  assert.match(response.text, /<span class="line">hello<\/span>/);
});

test("integration: save log filename keeps reserved characters encoded after basename sanitization", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  const response = await http
    .post("/save/%2E%2E%2Funsafe%3Fname%23chunk.html")
    .type("form")
    .send({ buffer: "x" })
    .expect(200);

  assert.match(response.headers["content-disposition"] || "", /filename=unsafe%3Fname%23chunk\.html/);
  assert.match(response.text, /<div id="lineBuffer">x<\/div>/);
});

test("integration: save log handles empty and unicode buffers and encodes filenames", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);

  const empty = await http
    .post("/save/empty log.html")
    .type("form")
    .send({ buffer: "" })
    .expect(200);
  assert.match(empty.headers["content-disposition"] || "", /filename=empty%20log\.html/);
  assert.match(empty.text, /<div id="lineBuffer"><\/div>/);

  const unicodeBuffer = "<p>こんにちは 🌙</p>";
  const unicode = await http
    .post("/save/unicode-ßpace.html")
    .type("form")
    .send({ buffer: unicodeBuffer })
    .expect(200);
  assert.match(unicode.headers["content-disposition"] || "", /filename=unicode-%C3%9Fpace\.html/);
  assert.match(unicode.text, /こんにちは/);

  const bigBuffer = "<span>line</span>".repeat(5000);
  const big = await http
    .post("/save/big-log.html")
    .type("form")
    .send({ buffer: bigBuffer })
    .expect(200);
  assert.ok(big.text.length > 10000);
  assert.match(big.text, /<title>Web Client Buffer<\/title>/);
});

test("integration: save log handles large mixed unicode and ansi-like content", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  const line = "alpha \u001b[31mred\u001b[0m こんにちは 🌙\n";
  const buffer = `<pre>${line.repeat(3000)}</pre>`;

  const started = Date.now();
  const response = await http
    .post("/save/ansi-unicode-stress.html")
    .type("form")
    .send({ buffer })
    .expect(200);
  const elapsed = Date.now() - started;

  assert.match(response.headers["content-type"] || "", /text\/html/);
  assert.match(response.text, /<title>Web Client Buffer<\/title>/);
  assert.match(response.text, /こんにちは/);
  assert.match(response.text, /red/);
  assert.ok(response.text.length > 40000);
  assert.ok(elapsed < 3000);
});

test("integration: save log accepts missing and non-string buffer payloads", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);

  const missing = await http
    .post("/save/missing-buffer.html")
    .type("form")
    .send({})
    .expect(200);
  assert.match(missing.text, /<div id="lineBuffer"><\/div>/);

  const numeric = await http
    .post("/save/numeric-buffer.html")
    .type("form")
    .send({ buffer: 12345 })
    .expect(200);
  assert.match(numeric.text, /<div id="lineBuffer">12345<\/div>/);

  const objectLike = await http
    .post("/save/object-buffer.html")
    .type("form")
    .send({ buffer: { sample: true } })
    .expect(200);
  assert.match(objectLike.headers["content-type"] || "", /text\/html/);
  assert.match(objectLike.text, /<div id="lineBuffer">/);
});

test("integration: save log preserves style-like payload safely in html output", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  const payload = "<span></style><script>bad()</script></span>";
  const response = await http
    .post("/save/style-like.html")
    .type("form")
    .send({ buffer: payload })
    .expect(200);

  assert.match(response.text, /<style>/);
  assert.match(response.text, /<span><\/style><script>bad\(\)<\/script><\/span>/);
  assert.match(response.text, /<div id="lineBuffer"><span><\/style><script>bad\(\)<\/script><\/span><\/div>/);
});

test("integration: save log preserves html envelope with malformed nested markup and large payload", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  const payload = ("<!--x--><div><span><p></div></span>" + "<script>noop()</script>").repeat(8000);
  const response = await http
    .post("/save/malformed-large.html")
    .type("form")
    .send({ buffer: payload })
    .expect(200);

  assert.match(response.headers["content-type"] || "", /text\/html/);
  assert.match(response.text, /<html><head>/);
  assert.match(response.text, /<title>Web Client Buffer<\/title>/);
  assert.match(response.text, /<div id="lineBuffer">/);
  assert.match(response.text, /<\/div><\/div><\/body><\/html>/);
  assert.ok(response.text.length > 50000);
});

test("integration: happy-path smoke login socket status health and save", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [{ name: "hero" }] } });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const agent = request.agent(baseUrl);
  await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "secret" })
    .expect(302);
  await agent.get("/").expect(200);
  await agent.get("/health/").expect(200);
  const saved = await agent
    .post("/save/smoke.html")
    .type("form")
    .send({ buffer: "<p>smoke</p>" })
    .expect(200);
  assert.match(saved.text, /smoke/);

  await new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000
    });
    socket.on("connect_error", reject);
    socket.on("error", reject);
    socket.on("connect", () => {
      socket.disconnect();
      resolve();
    });
  });
});

test("integration: session journey covers login connect client editor and save routes", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://remoteauth.test")
    .post("/session/authenticate/")
    .reply(200, { status: "ok", user: { perms: [1], chars: [{ name: "hero" }] } });
  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const agent = request.agent(baseUrl);

  const login = await agent
    .post("/website-login/")
    .type("form")
    .send({ email: "player@test", pass: "secret" })
    .expect(302);
  assert.equal(login.headers.location, "/");

  const connect = await agent.get("/").expect(200);
  assert.match(connect.text, /Play As/i);
  assert.match(connect.text, /id="user-picker"/);

  const client = await agent.get("/player-client/").expect(200);
  assert.match(client.text, /id="lineBuffer"/);
  assert.match(client.text, /id="inputBuffer"/);

  const editor = await agent.get("/editor/ide/").expect(200);
  assert.match(editor.text, /id="root"/);

  const save = await agent
    .post("/save/session-journey.html")
    .type("form")
    .send({ buffer: "<span>journey</span>" })
    .expect(200);
  assert.match(save.text, /<div id="lineBuffer"><span>journey<\/span><\/div>/);
});

test("integration: missing static assets return 404", async (t) => {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  nock("http://status.test")
    .persist()
    .get("/moo/status/")
    .reply(200, {
      message: "moo ok",
      cpu: 0,
      memory: 0,
      checked: Date.now(),
      users: 0,
      interval: 15,
      state: "OK"
    }, { "Content-Type": "application/json" });

  const { baseUrl } = await bootServer(t);
  const http = request(baseUrl);
  await http.get("/js/does-not-exist.js").expect(404);
});

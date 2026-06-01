/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import request from "supertest";

test("integration: https startup path initializes ssl server and returns binding metadata", async (t) => {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const keyPath = `/tmp/dome-client-test-${Date.now()}.key`;
  const certPath = `/tmp/dome-client-test-${Date.now()}.crt`;
  fs.writeFileSync(keyPath, "test-key");
  fs.writeFileSync(certPath, "test-cert");
  t.after(() => {
    try { fs.unlinkSync(keyPath); } catch {}
    try { fs.unlinkSync(certPath); } catch {}
  });

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
      host: "moo.test",
      port: 5555
    },
    website: {
      signupUrl: ""
    },
    guest: {
      connectCommand: "connect guest"
    },
    autocomplete: {
      enabled: false,
      p: "data/autocomplete/player.txt"
    },
    editor: {
      localSaveNodeMaxLines: 200,
      localSaveNodeAdminMaxLines: 800,
      localSaveNoteMaxLines: 20,
      ideEditOpenParent: false,
      ideVmsNoteEnabled: false
    },
    shorten: {
      enabled: false
    },
    remoteAuth: {
      enabled: false,
      host: "http://remoteauth.test",
      path: "/session/authenticate/",
      remoteSecret: "sekret"
    },
    status: {
      serviceUrl: ""
    },
    ssl: {
      port: 0,
      key: keyPath,
      cert: certPath
    }
  };

  const httpServer = new EventEmitter();
  httpServer.listen = (...args) => {
    const cb = args.at(-1);
    if (typeof cb === "function") {
      cb();
    }
  };
  httpServer.close = (cb) => cb?.();
  httpServer.address = () => ({ address: "127.0.0.1", family: "IPv4", port: 18100 });

  const httpsServer = new EventEmitter();
  httpsServer.listen = (...args) => {
    const cb = args.at(-1);
    if (typeof cb === "function") {
      cb();
    }
  };
  httpsServer.close = (cb) => cb?.();
  httpsServer.address = () => ({ address: "127.0.0.1", family: "IPv4", port: 18101 });

  moduleMock("../../src/config/index.js", { defaultExport: config });
  moduleMock("../../src/logger.js", {
    defaultExport: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      child() {
        return this;
      }
    },
    namedExports: {
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      }),
      inspect() {}
    }
  });
  moduleMock("node:http", {
    namedExports: {
      ...http,
      createServer() {
        return httpServer;
      }
    },
    defaultExport: {
      ...http,
      createServer() {
        return httpServer;
      }
    }
  });
  moduleMock("node:https", {
    namedExports: {
      ...https,
      createServer() {
        return httpsServer;
      }
    },
    defaultExport: {
      ...https,
      createServer() {
        return httpsServer;
      }
    }
  });

  const { start, stop } = await import(`../../src/server.js?https-startup=${Date.now()}`);
  const runtime = await start({ port: 0, httpsPort: 0, ip: "127.0.0.1", skipBuild: true });
  await stop();

  assert.equal(runtime.http?.type, "tcp");
  assert.equal(runtime.https?.type, "tcp");
  assert.equal(runtime.http?.port, 18100);
  assert.equal(runtime.https?.port, 18101);
  t.mock.restoreAll();
});

test("integration: https mode serves core routes on app handlers for both http and https servers", async (t) => {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const keyPath = `/tmp/dome-client-test-${Date.now()}.key`;
  const certPath = `/tmp/dome-client-test-${Date.now()}.crt`;
  fs.writeFileSync(keyPath, "test-key");
  fs.writeFileSync(certPath, "test-cert");
  t.after(() => {
    try { fs.unlinkSync(keyPath); } catch {}
    try { fs.unlinkSync(certPath); } catch {}
  });

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
      host: "moo.test",
      port: 5555
    },
    website: {
      signupUrl: ""
    },
    guest: {
      connectCommand: "connect guest"
    },
    autocomplete: {
      enabled: false,
      p: "data/autocomplete/player.txt"
    },
    editor: {
      localSaveNodeMaxLines: 200,
      localSaveNodeAdminMaxLines: 800,
      localSaveNoteMaxLines: 20,
      ideEditOpenParent: false,
      ideVmsNoteEnabled: false
    },
    shorten: {
      enabled: false
    },
    remoteAuth: {
      enabled: false,
      host: "http://remoteauth.test",
      path: "/session/authenticate/",
      remoteSecret: "sekret"
    },
    status: {
      serviceUrl: ""
    },
    ssl: {
      port: 0,
      key: keyPath,
      cert: certPath
    }
  };

  const httpServer = new EventEmitter();
  httpServer.listen = (...args) => {
    const cb = args.at(-1);
    if (typeof cb === "function") {
      cb();
    }
  };
  httpServer.close = (cb) => cb?.();
  httpServer.address = () => ({ address: "127.0.0.1", family: "IPv4", port: 19100 });

  const httpsServer = new EventEmitter();
  httpsServer.listen = (...args) => {
    const cb = args.at(-1);
    if (typeof cb === "function") {
      cb();
    }
  };
  httpsServer.close = (cb) => cb?.();
  httpsServer.address = () => ({ address: "127.0.0.1", family: "IPv4", port: 19101 });

  moduleMock("../../src/config/index.js", { defaultExport: config });
  moduleMock("../../src/logger.js", {
    defaultExport: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      child() {
        return this;
      }
    },
    namedExports: {
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      }),
      inspect() {}
    }
  });
  moduleMock("node:http", {
    namedExports: {
      ...http,
      createServer(app) {
        httpServer.app = app;
        return httpServer;
      }
    },
    defaultExport: {
      ...http,
      createServer(app) {
        httpServer.app = app;
        return httpServer;
      }
    }
  });
  moduleMock("node:https", {
    namedExports: {
      ...https,
      createServer(_sslOpts, app) {
        httpsServer.app = app;
        return httpsServer;
      }
    },
    defaultExport: {
      ...https,
      createServer(_sslOpts, app) {
        httpsServer.app = app;
        return httpsServer;
      }
    }
  });

  const { start, stop } = await import(`../../src/server.js?https-routes=${Date.now()}`);
  await start({ port: 0, httpsPort: 0, ip: "127.0.0.1", skipBuild: true });

  await request(httpServer.app).get("/health/").expect(200);
  await request(httpServer.app).get("/moo/status/").expect(200);
  await request(httpsServer.app).get("/health/").expect(200);
  await request(httpsServer.app).get("/moo/status/").expect(200);

  await stop();
  t.mock.restoreAll();
});

/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { EventEmitter } from "node:events";

async function loadClientApp(t, config, options = {}) {
  const { mock } = t;
  mock.reset();
  const normalizedConfig = {
    ...config,
    shorten: config.shorten || { enabled: false },
    guest: config.guest || { connectCommand: "connect guest" }
  };
  const logs = { info: [], error: [] };
  const loggerError = mock.fn((msg, err) => {
    logs.error.push(msg);
    void err;
  });

  const httpsMgr = {
    events: {},
    on: mock.fn((event, cb) => {
      httpsMgr.events[event] = cb;
      if (event === "connection") {
        cb({});
      }
    }),
    close: mock.fn((cb) => { if (cb) cb(); })
  };
  const httpMgr = {
    events: {},
    on: mock.fn((event, cb) => {
      httpMgr.events[event] = cb;
      if (event === "connection") {
        cb({});
      }
    }),
    close: mock.fn((cb) => { if (cb) cb(); })
  };

  const httpServer = new EventEmitter();
  const httpListen = mock.fn((...args) => {
    const cb = args.at(-1);
    if (options.httpListenError) {
      setImmediate(() => httpServer.emit("error", options.httpListenError));
    } else if (typeof cb === "function") {
      cb();
    }
  });
  httpServer.listen = httpListen;
  httpServer.close = mock.fn((cb) => { if (cb) cb(); });
  const httpsServer = new EventEmitter();
  const httpsListen = mock.fn((...args) => {
    const cb = args.at(-1);
    if (options.httpsListenError) {
      setImmediate(() => httpsServer.emit("error", options.httpsListenError));
    } else if (typeof cb === "function") {
      cb();
    }
  });
  httpsServer.listen = httpsListen;
  httpsServer.close = mock.fn((cb) => { if (cb) cb(); });
  let httpsCreated = false;
  let httpsOptions;

  const fsMock = {
    readFileSync: mock.fn((p) => options.readFileSync ? options.readFileSync(p) : "data"),
    readFile: mock.fn((p, cb) => { cb(null); }),
    promises: {
      readFile: mock.fn(async () => {
        if (options.readFileError) {
          throw new Error("fail");
        }
      })
    }
  };

  let middlewareFns = [];
  let lessOptions;
  let morganStream;
  let morganSkip;
  let disable;

  const mockCtxs = [];

  mockCtxs.push(mock.module("../src/config/index.js", { defaultExport: normalizedConfig }));
  mockCtxs.push(mock.module("../src/logger.js", {
    namedExports: {
      named() {
        return {
          info(msg) {
            logs.info.push(msg);
          },
          error: loggerError
        };
      }
    }
  }));
  mockCtxs.push(mock.module("node:fs", {
    defaultExport: fsMock,
    namedExports: fsMock
  }));
  mockCtxs.push(mock.module("node:http", {
    defaultExport: { createServer() { return httpServer; } },
    namedExports: { createServer() { return httpServer; } }
  }));
  mockCtxs.push(mock.module("node:https", {
    defaultExport: {
      createServer(opts) {
        httpsCreated = true;
        httpsOptions = opts;
        return httpsServer;
      }
    },
    namedExports: {
      createServer(opts) {
        httpsCreated = true;
        httpsOptions = opts;
        return httpsServer;
      }
    }
  }));
  mockCtxs.push(mock.module("socket.io", {
    namedExports: {
      Server: function(server, opts) {
        return opts ? httpsMgr : httpMgr;
      }
    }
  }));
  const express = () => {
    middlewareFns = [];
    disable = mock.fn();
    return {
      set() {},
      disable,
      use(...args) {
        middlewareFns.push(args.at(-1));
      },
      get() {},
      post() {}
    };
  };
  express.static = () => () => {};
  express.urlencoded = () => () => {};
  express.Router = () => {
    const r = () => {};
    r.use = () => {};
    r.get = () => {};
    r.post = () => {};
    return r;
  };
  mockCtxs.push(mock.module("express", { defaultExport: express }));
  mockCtxs.push(mock.module("cookie-parser", { defaultExport: () => () => {} }));
  mockCtxs.push(mock.module("express-session", { defaultExport: () => () => {} }));
  mockCtxs.push(mock.module("morgan", {
    defaultExport: (format, opts = {}) => {
      morganStream = opts.stream;
      morganSkip = opts.skip;
      return () => {};
    }
  }));
  mockCtxs.push(mock.module("../src/middleware/less-middleware.js", {
    defaultExport: (dir, opts) => {
      lessOptions = opts;
      return () => {};
    }
  }));
  mockCtxs.push(mock.module("../src/services/ua.js", {
    namedExports: {
      deviceCapture() { return () => {}; },
      parse() {
        return {
          toAgent() { return ""; },
          os: { toString() { return ""; } },
          device: { toString() { return ""; }, type() { return "desktop"; } }
        };
      }
    }
  }));
  mockCtxs.push(mock.module("../src/services/build.js", { defaultExport: options.build || (() => Promise.resolve()) }));
  mockCtxs.push(mock.module("../src/controllers/autocomplete.js", { namedExports: { basic() {} } }));
  mockCtxs.push(mock.module("../src/controllers/screens.js", {
    namedExports: {
      connect() {},
      options() {},
      client() {},
      editor() {}
    }
  }));
  const socketHandlers = {
    connection: mock.fn(),
    error: mock.fn()
  };
  mockCtxs.push(mock.module("../src/controllers/socket.js", { namedExports: socketHandlers }));
  mockCtxs.push(mock.module("../src/controllers/status.js", { namedExports: { get() {} } }));
  mockCtxs.push(mock.module("../src/controllers/save.js", { namedExports: { log() {} } }));
  mockCtxs.push(mock.module("../src/controllers/auth.js", {
    namedExports: {
      login() {}
    }
  }));

  const moduleUrl = new URL("../src/server.js", import.meta.url).href;
  const importPath = `${moduleUrl}?${Date.now()}`;
  const prior = global.__coverage__ && global.__coverage__[moduleUrl];
  let stop;
  try {
    const appModule = await import(importPath);
    stop = appModule.stop;
    await appModule.start();
    if (global.__coverage__) {
      const current = global.__coverage__[importPath];
      if (current) {
        if (prior) {
          for (const k in current.s) {
            current.s[k] += prior.s[k] || 0;
          }
          for (const k in current.f) {
            current.f[k] += prior.f[k] || 0;
          }
          for (const k in current.b) {
            const arr = current.b[k];
            const prev = prior.b[k] || [];
            for (let i = 0; i < arr.length; i++) {
              arr[i] += prev[i] || 0;
            }
          }
        }
        global.__coverage__[moduleUrl] = current;
        delete global.__coverage__[importPath];
      }
    }
  } finally {
    mockCtxs.forEach((ctx) => ctx.restore());
  }

  const req = { headers: {} };
  const res = { locals: {}, header() {} };
  middlewareFns.forEach((fn) => {
    if (fn.length < 4) {
      fn(req, res, () => {});
    }
  });
  if (res.locals.showReporter) {
    res.locals.showReporter({ headers: {} });
    res.locals.showReporter({ headers: { "user-agent": "MSAppHost" } });
  }
  if (lessOptions && lessOptions.preprocess && lessOptions.preprocess.path) {
    lessOptions.preprocess.path("a" + path.sep + "css" + path.sep + "b");
  }
  const handler = process.listeners("uncaughtException").at(-1);
  if (handler) {
    handler(new Error("boom"));
    process.removeListener("uncaughtException", handler);
  }

  return {
    logs,
    httpsMgr,
    httpsCreated,
    httpsOptions,
    fsMock,
    loggerError,
    morganStream,
    morganSkip,
    disable,
    res,
    httpListen,
    httpsListen,
    httpMgr,
    middlewareFns,
    socketHandlers,
    stop,
    httpServer,
    httpsServer
  };
}

test("disables x-powered-by header", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const { disable } = await loadClientApp(t, config);
  assert.ok(disable.mock.calls.some((c) => c.arguments[0] === "x-powered-by"));
});

test("creates https server and logs when ssl config provided", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: ""
    },
    ssl: {
      key: "key.pem",
      cert: "cert.pem",
      port: 3443
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {}
  };

  const { logs, httpsCreated } = await loadClientApp(t, config);
  assert.strictEqual(httpsCreated, true);
  assert.ok(logs.info.includes("socket.io listening to http"));
  assert.ok(logs.info.includes("socket.io listening to https"));
});

test("logs requests through winston", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const { logs, morganStream } = await loadClientApp(t, config);
  morganStream.write("GET /foo 200\n");
  assert.ok(logs.info.includes("GET /foo 200"));
});

test("skips logging healthcheck requests", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const { morganSkip } = await loadClientApp(t, config);
  assert.strictEqual(morganSkip({ path: "/moo/status/" }), true);
  assert.strictEqual(morganSkip({ path: "/foo" }), false);
});

test("creates https server with ca and passphrase", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    ssl: {
      key: "key.pem",
      cert: "cert.pem",
      ca: "ca.pem",
      passphrase: "phrase",
      port: 3443,
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const readFileSync = (p) => `dummy-${p}`;
  const { logs, httpsCreated, httpsOptions, fsMock } = await loadClientApp(t, config, { readFileSync });
  assert.strictEqual(httpsCreated, true);
  assert.deepStrictEqual(
    {
      key: httpsOptions.key,
      cert: httpsOptions.cert,
      ca: httpsOptions.ca,
      passphrase: httpsOptions.passphrase,
    },
    {
      key: "dummy-key.pem",
      cert: "dummy-cert.pem",
      ca: "dummy-ca.pem",
      passphrase: "phrase",
    }
  );
  assert.deepStrictEqual(fsMock.readFileSync.mock.calls.map((c) => c.arguments[0]), ["key.pem", "cert.pem", "ca.pem"]);
  assert.ok(logs.info.includes("socket.io listening to http"));
  assert.ok(logs.info.includes("socket.io listening to https"));
});

test("registers https connection and error handlers", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    ssl: {
      key: "key.pem",
      cert: "cert.pem",
      port: 3443,
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const { httpsMgr, fsMock } = await loadClientApp(t, config);
  assert.deepStrictEqual(fsMock.readFileSync.mock.calls.map((c) => c.arguments[0]), ["key.pem", "cert.pem"]);
  assert.deepStrictEqual(httpsMgr.on.mock.calls.map((c) => c.arguments[0]), ["connection", "error"]);
});

test("falls back to http when ssl config missing", async (t) => {
  const config = {
    node: {
      mode: "production",
      port: 3000,
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {}
  };

  const { logs, httpsCreated } = await loadClientApp(t, config);
  await Promise.resolve();
  assert.strictEqual(httpsCreated, false);
  assert.ok(logs.info.some((m) => m.includes("listening on port")));
});

test("decache appends hash and logs error if autocomplete file check fails", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {}
  };

  const { logs, res } = await loadClientApp(t, config, { readFileError: true });
  await Promise.resolve();
  const decached = res.locals.decache("/foo");
  assert.ok(decached.startsWith("/foo?"));
  assert.notEqual(decached, "/foo?");
  assert.ok(logs.error.some((m) => m.includes("error while checking for autocomplete file")));
});

test("servers listen on ports when ip not configured", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    ssl: {
      key: "key.pem",
      cert: "cert.pem",
      ca: "ca.pem",
      passphrase: "phrase",
      port: 3443
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {}
  };

  const { httpListen, httpsListen } = await loadClientApp(t, config);
  assert.strictEqual(httpListen.mock.calls[0].arguments[0], 3000);
  assert.strictEqual(httpListen.mock.calls[0].arguments.length, 2);
  assert.strictEqual(httpsListen.mock.calls[0].arguments[0], 3443);
  assert.strictEqual(httpsListen.mock.calls[0].arguments.length, 2);
});

test("servers listen on configured ip when provided", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    ssl: {
      key: "key.pem",
      cert: "cert.pem",
      ca: "ca.pem",
      passphrase: "phrase",
      port: 3443
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const { httpListen, httpsListen } = await loadClientApp(t, config);
  assert.deepStrictEqual(httpListen.mock.calls[0].arguments.slice(0, 2), [3000, "127.0.0.1"]);
  assert.deepStrictEqual(httpsListen.mock.calls[0].arguments.slice(0, 2), [3443, "127.0.0.1"]);
});

test("logs error when asset build fails", async (t) => {
  const config = {
    node: {
      mode: "production",
      port: 3000,
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const err = new Error("fail");
  const build = t.mock.fn(() => Promise.reject(err));
  const { loggerError } = await loadClientApp(t, config, { build });
  await Promise.resolve();
  assert.ok(loggerError.mock.calls.some((c) => c.arguments[0] === "asset build failed" && c.arguments[1] === err));
  build.mock.restore();
  loggerError.mock.restore();
});

test("start resolves when servers listen", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const unhandled = new Promise((resolve, reject) => {
    function handler(err) {
      clearTimeout(timer);
      reject(err);
    }
    const timer = setTimeout(() => {
      process.removeListener("unhandledRejection", handler);
      resolve();
    }, 10);
    process.once("unhandledRejection", handler);
  });

  await loadClientApp(t, config);
  await unhandled;
});

test("start rejects when server listen fails", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const err = new Error("fail");
  await assert.rejects(
    () => loadClientApp(t, config, { httpListenError: err }),
    err
  );
});

test("start listens on https when ssl configured without ip", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    ssl: { key: "k", cert: "c", port: 3443 },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const { httpListen, httpsListen } = await loadClientApp(t, config);
  assert.strictEqual(httpListen.mock.calls[0].arguments[0], 3000);
  assert.strictEqual(httpsListen.mock.calls[0].arguments[0], 3443);
});

test("start skips https listen when ssl missing", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const { httpListen, httpsListen } = await loadClientApp(t, config);
  assert.strictEqual(httpListen.mock.calls.length, 1);
  assert.strictEqual(httpsListen.mock.calls.length, 0);
});

test("logs errors when build and autocomplete check fail", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const err = new Error("fail");
  const { loggerError } = await loadClientApp(t, config, {
    build: () => Promise.reject(err),
    readFileError: true,
  });
  await Promise.resolve();
  const msgs = loggerError.mock.calls.map((c) => c.arguments[0]);
  assert.ok(msgs.includes("asset build failed"));
  assert.ok(msgs.includes("error while checking for autocomplete file "));
});

test("http and https managers emit events", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    ssl: { key: "k", cert: "c", port: 3443 },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const { httpMgr, httpsMgr, socketHandlers } = await loadClientApp(t, config);
  const before = socketHandlers.connection.mock.calls.length;
  httpMgr.events.connection({});
  httpsMgr.events.connection({});
  assert.strictEqual(socketHandlers.connection.mock.calls.length, before + 2);
  const err = new Error("boom");
  httpMgr.events.error(err);
  httpsMgr.events.error(err);
  const errorCalls = socketHandlers.error.mock.calls.filter((c) => c.arguments[0] === err);
  assert.strictEqual(errorCalls.length, 2);
});

test("route errors reach global handler", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const { middlewareFns, loggerError } = await loadClientApp(t, config);
  const errMw = middlewareFns.find((fn) => fn.length === 4);
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
    },
  };
  errMw(new Error("boom"), {}, res, () => {});
  assert.strictEqual(res.statusCode, 500);
  assert.deepStrictEqual(res.body, { error: "Internal Server Error" });
  assert.ok(loggerError.mock.calls.some((c) => c.arguments[0] === "request error"));
});

test("stop closes servers and managers", async (t) => {
  const config = {
    node: {
      mode: "development",
      port: 3000,
      ip: "127.0.0.1",
      socketUrl: "",
      socketUrlSSL: "",
      session: { secret: "x" },
      poweredBy: "",
    },
    ssl: { key: "key.pem", cert: "cert.pem", port: 3443 },
    autocomplete: { p: "ac.txt" },
    moo: { name: "" },
    website: { base: "" },
    heap: {},
  };

  const { stop, httpServer, httpsServer, httpMgr, httpsMgr, socketHandlers } = await loadClientApp(t, config);
  const err = new Error("boom");
  httpMgr.events.error(err);
  httpsMgr.events.error(err);

  await stop();

  const errorCalls = socketHandlers.error.mock.calls.filter((c) => c.arguments[0] === err);
  assert.strictEqual(errorCalls.length, 2);
  assert.strictEqual(httpServer.close.mock.calls.length, 1);
  assert.strictEqual(httpsServer.close.mock.calls.length, 1);
  assert.strictEqual(httpMgr.close.mock.calls.length, 1);
  assert.strictEqual(httpsMgr.close.mock.calls.length, 1);
});

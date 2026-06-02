/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import nock from "nock";

function createBaseConfig() {
  return {
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
    remoteAuth: {
      enabled: true,
      host: "http://remoteauth.test",
      path: "/session/authenticate/",
      remoteSecret: "sekret"
    },
    status: {
      serviceUrl: "http://status.test/moo/status/"
    }
  };
}

export async function bootServer(t, {
  remoteAuth,
  status,
  node = {},
  moo = {},
  website = {},
  autocomplete = {},
  acmeWebroot,
  screensController,
  loggerModule,
  mockSocketController = true,
  moduleMocks
} = {}) {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const config = createBaseConfig();
  if (remoteAuth) {
    config.remoteAuth = remoteAuth;
  }
  if (status) {
    config.status = status;
  }
  Object.assign(config.node, node);
  Object.assign(config.moo, moo);
  Object.assign(config.website, website);
  Object.assign(config.autocomplete, autocomplete);

  const originalAcmeWebroot = process.env.ACME_WEBROOT;
  if (typeof acmeWebroot === "string") {
    process.env.ACME_WEBROOT = acmeWebroot;
  }

  moduleMock("../../../src/config/index.js", { defaultExport: config });
  moduleMock("../../../src/logger.js", loggerModule || {
    namedExports: {
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      })
    }
  });
  if (mockSocketController) {
    moduleMock("../../../src/controllers/socket.js", {
      namedExports: {
        connection() {},
        error() {},
      }
    });
  }
  if (screensController) {
    moduleMock("../../../src/controllers/screens.js", {
      namedExports: screensController
    });
  }
  if (typeof moduleMocks === "function") {
    await moduleMocks(moduleMock, config);
  }

  const { start, stop } = await import(`../../../src/server.js?integration=${Date.now()}-${Math.random()}`);
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
    baseUrl: `http://127.0.0.1:${runtime.http.port}`,
    config
  };
}

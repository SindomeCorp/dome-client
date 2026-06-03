/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import nock from "nock";
import { createIntegrationConfig } from "./config.js";

export async function bootServer(t, {
  remoteAuth,
  status,
  node = {},
  moo = {},
  website = {},
  autocomplete = {},
  editor = {},
  shorten = {},
  acmeWebroot,
  screensController,
  loggerModule,
  mockSocketController = true,
  moduleMocks
} = {}) {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const configOverrides = {
    node,
    moo,
    website,
    autocomplete,
    editor,
    shorten
  };
  if (remoteAuth) {
    configOverrides.remoteAuth = remoteAuth;
  }
  if (status) {
    configOverrides.status = status;
  }
  const config = createIntegrationConfig(configOverrides);

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

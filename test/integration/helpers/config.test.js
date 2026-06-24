/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createIntegrationConfig } from "./config.js";

test("createIntegrationConfig returns default integration config", () => {
  const config = createIntegrationConfig();

  assert.equal(config.node.mode, "test");
  assert.equal(config.node.port, 0);
  assert.equal(config.moo.name, "Integration MUD");
  assert.equal(config.autocomplete.enabled, false);
  assert.equal(config.editor.localSaveNodeMaxLines, 200);
  assert.equal(config.shorten.enabled, false);
  assert.equal(config.remoteAuth.enabled, true);
  assert.equal(config.status.serviceUrl, "http://status.test/moo/status/");
});

test("createIntegrationConfig merges nested overrides without mutating defaults", () => {
  const config = createIntegrationConfig({
    node: {
      multiMud: true,
      session: {
        secret: "override-secret"
      }
    },
    moo: {
      host: "example.test",
      tlsEnabled: true
    },
    remoteAuth: {
      enabled: false
    },
    status: {
      serviceUrl: ""
    }
  });
  const nextConfig = createIntegrationConfig();

  assert.equal(config.node.multiMud, true);
  assert.equal(config.node.session.secret, "override-secret");
  assert.equal(config.node.poweredBy, "Dome Client");
  assert.equal(config.moo.host, "example.test");
  assert.equal(config.moo.port, 4444);
  assert.equal(config.moo.tlsEnabled, true);
  assert.equal(config.remoteAuth.enabled, false);
  assert.equal(config.remoteAuth.host, "http://remoteauth.test");
  assert.equal(config.status.serviceUrl, "");
  assert.equal(nextConfig.node.multiMud, false);
  assert.equal(nextConfig.remoteAuth.enabled, true);
});

/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";

import config from "../../src/config/index.js";

export function getEnv() {
  return config.node;
}

test("config/env loads node configuration", () => {
  assert.equal(typeof getEnv(), "object");
});

test("maps the optional service settings and normalizes the editor parser", async (t) => {
  const { default: configured } = await withConfig(t, {
    EDITOR_IDE_PARSER: "  MOO  ",
    WEBSITE_SIGNUP_URL: "https://website.test/signup",
    GUEST_CONNECT_COMMAND: "connect fixture",
    AUTOCOMPLETE_ENABLED: true,
    AUTOCOMPLETE_P: "fixture-player.txt",
    REMOTEAUTH_ENABLED: true,
    REMOTEAUTH_HOST: "https://auth.test",
    STATUS_SERVICE_URL: "https://status.test/"
  });
  assert.equal(configured.editor.parser, "moo");
  assert.equal(configured.website.signupUrl, "https://website.test/signup");
  assert.equal(configured.guest.connectCommand, "connect fixture");
  assert.equal(configured.autocomplete.enabled, true);
  assert.equal(configured.autocomplete.p, "fixture-player.txt");
  assert.equal(configured.remoteAuth.enabled, true);
  assert.equal(configured.remoteAuth.host, "https://auth.test");
  assert.equal(configured.status.serviceUrl, "https://status.test/");
});

test("unsupported parsers stay disabled and TLS requires both paths", async (t) => {
  for (const [key, cert] of [["fixture-key", ""], ["", "fixture-cert"]]) {
    const { default: configured } = await withConfig(t, {
      EDITOR_IDE_PARSER: "other",
      SSL_KEY: key,
      SSL_CERT: cert
    });
    assert.equal(configured.editor.parser, "");
    assert.equal(configured.ssl, undefined);
  }
});

let configRevision = 0;
async function withConfig(t, settings) {
  const mock = t.mock.module("../../src/env.js", {
    defaultExport: { ...settings }
  });
  try {
    return await import(`../../src/config/index.js?settings=${configRevision++}`);
  } finally {
    mock.restore();
  }
}

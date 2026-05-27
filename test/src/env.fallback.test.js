/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import { test } from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import dotenv from "dotenv";

const envUrl = new URL("../../src/env.js", import.meta.url);

const defaults = {
  NODE_MODE: "dev",
  NODE_PORT: 80,
  NODE_SOCKET_URL: "http://localhost:8080",
  NODE_SOCKET_URL_SSL: "",
  NODE_SOCKET_PROXIED: false,
  NODE_POWERED_BY: "Dome Client",
  LOG_LEVEL: "info",
  SESSION_SECRET: "dev-session-secret-change-me",
  SSL_PORT: 443,
  SSL_KEY: "",
  SSL_CERT: "",
  SSL_PASSPHRASE: "",
  MOO_NAME: "Sindome",
  MUD_HOST: "moo.sindome.org",
  MUD_PORT: 5555,
  WEBSITE_SIGNUP_URL: "",
  GUEST_CONNECT_COMMAND: "connect guest",
  AUTOCOMPLETE_ENABLED: false,
  AUTOCOMPLETE_P: "data/autocomplete/player.txt",
  AUTOCOMPLETE_J: "data/autocomplete/justice.txt",
  AUTOCOMPLETE_A: "data/autocomplete/agent.txt",
  AUTOCOMPLETE_C: "data/autocomplete/creator.txt",
  AUTOCOMPLETE_W: "data/autocomplete/watcher.txt",
  AUTOCOMPLETE_O: "data/autocomplete/guest.txt",
  LOCAL_SAVE_NODE_MAX_LINES: 200,
  LOCAL_SAVE_NODE_ADMIN_MAX_LINES: 800,
  LOCAL_SAVE_NOTE_MAX_LINES: 20,
  IDE_EDIT_OPEN_PARENT: false,
  IDE_VMS_NOTE_ENABLED: false,
  SHORTEN_ENABLED: false,
  SHORTEN_HOST: "localhost",
  SHORTEN_PORT: 5549,
  SHORTEN_PATH: "/interface/v1/shorten/",
  SHORTEN_DOMAIN: "",
  SHORTEN_MINIMUM: 50,
  REMOTEAUTH_ENABLED: false,
  REMOTEAUTH_HOST: "http://localhost",
  REMOTEAUTH_PATH: "/session/authenticate/",
  REMOTEAUTH_REMOTE_SECRET: "dev-remoteauth-secret-change-me",
  GIT_HASH: "cafebabe"
};

const overrides = Object.fromEntries(
  Object.entries(defaults).map(([key, value]) => {
    if (typeof value === "number") {
      return [key, value + 1];
    }
    if (typeof value === "boolean") {
      return [key, !value];
    }
    return [key, `${value}-override`];
  })
);

function restoreEnv(saved) {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("falls back to defaults for all keys", async (t) => {
  const saved = {};
  for (const key of Object.keys(defaults)) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  const execMock = t.mock.method(childProcess, "execSync", () =>
    Buffer.from(`${defaults.GIT_HASH}\n`)
  );
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const env = (await import(`${envUrl.href}?${Date.now()}`)).default;
  for (const [key, value] of Object.entries(defaults)) {
    assert.equal(env[key], value);
  }
  assert.equal(execMock.mock.calls.length, 1);
  execMock.mock.restore();
  configMock.mock.restore();
  restoreEnv(saved);
});

test("uses provided env values for all keys", async (t) => {
  const saved = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    process.env[key] = String(value);
  }
  const execMock = t.mock.method(childProcess, "execSync", () =>
    Buffer.from("ignored\n")
  );
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const env = (await import(`${envUrl.href}?${Date.now()}`)).default;
  for (const [key, value] of Object.entries(overrides)) {
    assert.equal(env[key], value);
  }
  assert.equal(execMock.mock.calls.length, 0);
  execMock.mock.restore();
  configMock.mock.restore();
  restoreEnv(saved);
});

test("mixes defaults and overrides when some keys missing", async (t) => {
  const saved = {};
  const keys = Object.keys(defaults);
  const gitHashOverridden = keys.indexOf("GIT_HASH") % 2 === 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    saved[key] = process.env[key];
    if (i % 2 === 0) {
      process.env[key] = String(overrides[key]);
    } else {
      delete process.env[key];
    }
  }
  const execMock = t.mock.method(childProcess, "execSync", () =>
    Buffer.from(`${defaults.GIT_HASH}\n`)
  );
  const configMock = t.mock.method(dotenv, "config", () => ({}));
  const env = (await import(`${envUrl.href}?${Date.now()}`)).default;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const expected = i % 2 === 0 ? overrides[key] : defaults[key];
    assert.equal(env[key], expected);
  }
  assert.equal(execMock.mock.calls.length, gitHashOverridden ? 0 : 1);
  execMock.mock.restore();
  configMock.mock.restore();
  restoreEnv(saved);
});

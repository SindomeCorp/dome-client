import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MUD_HOST,
  DEFAULT_MUD_PORT,
  buildMooConnectCommand,
  buildPlayerClientUrl,
  resolvePlayerClientAddress
} from "../../src/client/client-connect-intent.js";

test("buildMooConnectCommand creates character login commands", () => {
  assert.equal(buildMooConnectCommand({ username: "hero", password: "pass" }), "connect hero pass");
  assert.equal(buildMooConnectCommand({ username: "hero", password: "" }), "connect hero");
  assert.equal(buildMooConnectCommand({ username: "", password: "pass" }), "");
});

test("resolvePlayerClientAddress trims values and falls back to defaults", () => {
  assert.deepEqual(resolvePlayerClientAddress({ host: " example.org ", port: " 7777 " }), {
    host: "example.org",
    port: "7777"
  });
  assert.deepEqual(resolvePlayerClientAddress({ host: "", port: "" }), {
    host: DEFAULT_MUD_HOST,
    port: DEFAULT_MUD_PORT
  });
});

test("buildPlayerClientUrl encodes host and port query parameters", () => {
  assert.equal(
    buildPlayerClientUrl({ host: "moo.example.org", port: "7777" }),
    "/player-client/?gh=moo.example.org&gp=7777"
  );
  assert.equal(
    buildPlayerClientUrl({ host: "host with spaces", port: "" }),
    `/player-client/?gh=host+with+spaces&gp=${DEFAULT_MUD_PORT}`
  );
});

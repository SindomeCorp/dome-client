import test from "node:test";
import assert from "node:assert/strict";
import { parseSocketPort, parseTransportMode, resolveGameAddress } from "../../src/services/socket-address.js";

test("parseSocketPort accepts valid mud ports", () => {
  assert.equal(parseSocketPort("23"), 23);
  assert.equal(parseSocketPort("7777"), 7777);
  assert.equal(parseSocketPort(65535), 65535);
});

test("parseSocketPort rejects missing and unsafe ports", () => {
  assert.equal(parseSocketPort(""), null);
  assert.equal(parseSocketPort("22"), null);
  assert.equal(parseSocketPort("65536"), null);
  assert.equal(parseSocketPort("abc"), null);
});

test("resolveGameAddress uses configured fallback when multi-mud is disabled", () => {
  const socket = { handshake: { query: { host: "example.org", port: "7777" } } };
  assert.deepEqual(resolveGameAddress(socket, {
    fallbackHost: "fallback.test",
    fallbackPort: 8888,
    multiMudEnabled: false
  }), { host: "fallback.test", port: 8888, useTls: false });
});

test("resolveGameAddress uses configured TLS when multi-mud is disabled", () => {
  const socket = { handshake: { query: { host: "example.org", port: "7777", transport_mode: "tcp" } } };
  assert.deepEqual(resolveGameAddress(socket, {
    fallbackHost: "fallback.test",
    fallbackPort: 8888,
    multiMudEnabled: false,
    mudTlsEnabled: true
  }), { host: "fallback.test", port: 8888, useTls: true });
});

test("resolveGameAddress uses valid multi-mud query host and port", () => {
  const socket = { handshake: { query: { host: " example.org ", port: "7777" } } };
  assert.deepEqual(resolveGameAddress(socket, {
    fallbackHost: "fallback.test",
    fallbackPort: 8888,
    multiMudEnabled: true
  }), { host: "example.org", port: 7777, useTls: false });
});

test("parseTransportMode only accepts tls", () => {
  assert.equal(parseTransportMode("tls"), "tls");
  assert.equal(parseTransportMode(" TLS "), "tls");
  assert.equal(parseTransportMode("ssl"), "tcp");
  assert.equal(parseTransportMode(""), "tcp");
});

test("resolveGameAddress honors multi-mud tls query only when enabled", () => {
  const socket = { handshake: { query: { host: "example.org", port: "7777", transport_mode: "tls" } } };
  const options = {
    fallbackHost: "fallback.test",
    fallbackPort: 8888,
    multiMudEnabled: true
  };
  assert.deepEqual(resolveGameAddress(socket, {
    ...options,
    mudTlsEnabled: false
  }), { host: "example.org", port: 7777, useTls: false });
  assert.deepEqual(resolveGameAddress(socket, {
    ...options,
    mudTlsEnabled: true
  }), { host: "example.org", port: 7777, useTls: true });
});

test("resolveGameAddress falls back for invalid multi-mud query values", () => {
  const options = {
    fallbackHost: "fallback.test",
    fallbackPort: 8888,
    multiMudEnabled: true
  };
  assert.deepEqual(resolveGameAddress({ handshake: { query: { host: "", port: "7777" } } }, options), {
    host: "fallback.test",
    port: 8888,
    useTls: false
  });
  assert.deepEqual(resolveGameAddress({ handshake: { query: { host: "example.org", port: "22" } } }, options), {
    host: "fallback.test",
    port: 8888,
    useTls: false
  });
});

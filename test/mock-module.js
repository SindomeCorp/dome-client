import { mock } from "node:test";

// provide minimal globals for client modules used in tests
globalThis.window = globalThis.window || {};
globalThis.dome = {};
globalThis.subs = [];

if (typeof mock.module !== "function" && typeof mock.import === "function") {
  mock.module = mock.import.bind(mock);
}

await import("../src/client/core/constants.js");

globalThis.dome = globalThis.dome || {};

export {};

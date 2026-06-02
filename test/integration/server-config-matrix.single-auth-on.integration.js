/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import { runMatrixCase } from "./helpers/server-config-matrix-case.js";

test("integration: matrix single-mud auth on status on", async (t) => {
  await runMatrixCase(t, {
    remoteAuthEnabled: true,
    multiMud: false,
    statusServiceUrl: "http://status.test/moo/status/",
    expect: {
      homeHas: /Website Login/i,
      homeMissing: /Connect To \.\.\./i,
      gameOwnerStatus: 404,
      statusMessage: "moo ok",
      statusState: "OK"
    }
  });
});

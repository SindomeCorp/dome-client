/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import { runMatrixCase } from "./helpers/server-config-matrix-case.js";

test("integration: matrix multi-mud auth on status on", async (t) => {
  await runMatrixCase(t, {
    remoteAuthEnabled: true,
    multiMud: true,
    statusServiceUrl: "http://status.test/moo/status/",
    expect: {
      homeHas: /Play Now/i,
      homeHasSecondary: /Connect To \.\.\./i,
      homeMissing: /Website Login/i,
      gameOwnerStatus: 200,
      statusMessage: "moo ok",
      statusState: "OK"
    }
  });
});

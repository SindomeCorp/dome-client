/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import { runMatrixCase } from "./helpers/server-config-matrix-case.js";

test("integration: matrix single-mud auth off status on", async (t) => {
  await runMatrixCase(t, {
    remoteAuthEnabled: false,
    multiMud: false,
    statusServiceUrl: "http://status.test/moo/status/",
    expect: {
      gameOwnerStatus: 404,
      statusMessage: "moo ok",
      statusState: "OK"
    }
  });
});

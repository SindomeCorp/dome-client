/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import { runHtmlSnapshotCase } from "./helpers/html-snapshot.js";

test("integration: html snapshot player-client status enabled", async (t) => {
  await runHtmlSnapshotCase(t, {
    configOverrides: {
      node: { multiMud: false },
      status: { serviceUrl: "http://status.test/moo/status/" }
    },
    path: "/player-client/",
    goldenFile: "test/integration/golden/player-client.status-on.json"
  });
});

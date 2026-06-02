/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import { runHtmlSnapshotCase } from "./helpers/html-snapshot.js";

test("integration: html snapshot home multi-mud", async (t) => {
  await runHtmlSnapshotCase(t, {
    configOverrides: {
      node: { multiMud: true },
      remoteAuth: { enabled: true },
      status: { serviceUrl: "http://status.test/moo/status/" }
    },
    path: "/",
    goldenFile: "test/integration/golden/home.multi.json"
  });
});

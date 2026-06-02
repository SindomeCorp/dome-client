/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import { runHtmlSnapshotCase } from "./helpers/html-snapshot.js";

test("integration: html snapshot home single-mud auth enabled", async (t) => {
  await runHtmlSnapshotCase(t, {
    configOverrides: {
      node: { multiMud: false },
      remoteAuth: { enabled: true },
      status: { serviceUrl: "http://status.test/moo/status/" }
    },
    path: "/",
    goldenFile: "test/integration/golden/home.single.auth-on.json"
  });
});

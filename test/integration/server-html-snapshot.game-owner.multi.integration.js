/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import { runHtmlSnapshotCase } from "./helpers/html-snapshot.js";

test("integration: html snapshot game-owner-questions multi-mud", async (t) => {
  await runHtmlSnapshotCase(t, {
    configOverrides: {
      node: { multiMud: true }
    },
    path: "/game-owner-questions/",
    goldenFile: "test/integration/golden/game-owner-questions.multi.json"
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { areaNames, getMutationArea } from "../../scripts/stryker-area.js";

const baseline = JSON.parse(readFileSync(new URL("../../stryker.conf.json", import.meta.url), "utf8"));

test("the baseline and named mutation areas cover each owned source module once", () => {
  const profiles = [baseline, ...areaNames().map(getMutationArea)];
  for (const file of globSync("src/**/*.{js,jsx}")) {
    if (file === "src/client/features/editor/ace/mode-moo.js") continue;
    const owners = profiles.filter(({ mutate }) => {
      const included = mutate.some(pattern => !pattern.startsWith("!") && matchesGlob(file, pattern));
      const excluded = mutate.some(pattern => pattern.startsWith("!") && matchesGlob(file, pattern.slice(1)));
      return included && !excluded;
    });
    assert.equal(owners.length, 1, file);
  }
});

test("named mutation areas have tests and isolated report and cache paths", () => {
  const paths = new Set([baseline.jsonReporter.fileName, baseline.incrementalFile]);
  for (const name of areaNames()) {
    const area = getMutationArea(name);
    const testPatterns = area.commandRunner.command.split(" --test ")[1].split(" ");
    for (const pattern of testPatterns) {
      assert.ok(globSync(pattern).length, `${name}: no tests matched ${pattern}`);
    }
    for (const path of [area.jsonReporter.fileName, area.incrementalFile]) {
      assert.ok(!paths.has(path), path);
      paths.add(path);
    }
  }
  assert.throws(() => getMutationArea("unknown"), /Unknown mutation area/);
});

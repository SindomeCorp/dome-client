import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("client modules do not import dome or use window.dome fallbacks", () => {
  const files = globSync("src/client/**/*.{js,jsx}", {
    cwd: repoRoot,
    nodir: true
  });
  const violations = [];

  files.forEach((file) => {
    const content = readFileSync(resolve(repoRoot, file), "utf8");
    [
      /import\s+\{[^}]*\bdome\b[^}]*\}\s+from\s+["'][^"']*core\/constants\.js["']/,
      /\bwindow\.dome\b/,
      /\bglobalThis\.dome\b/,
      /\bparentWindow\.dome\b/,
      /\bsetSocket\b/
    ].forEach((pattern) => {
      if (pattern.test(content)) {
        violations.push(`${relative(repoRoot, resolve(repoRoot, file))}: ${pattern}`);
      }
    });
  });

  assert.deepEqual(violations, []);
});

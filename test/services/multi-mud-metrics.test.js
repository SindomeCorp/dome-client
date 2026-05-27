import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("multi-mud metrics record and persist game counts", async () => {
  const metricsPath = path.join(process.cwd(), "data", "multi-mud-metrics.json");
  const tempPath = `${metricsPath}.tmp`;
  await fs.rm(metricsPath, { force: true });
  await fs.rm(tempPath, { force: true });

  const svc = await import(`../../src/services/multi-mud-metrics.js?cache=${Math.random()}`);
  svc.recordConnection("moo.sindome.org", 5555);
  svc.recordConnection("moo.sindome.org", 5555);
  svc.recordConnection("example.org", 7777);

  const stats = svc.connectedStats();
  assert.equal(stats.count, 3);
  assert.equal(stats.games[0].address, "moo.sindome.org:5555");
  assert.equal(stats.games[0].count, 2);
  assert.equal(stats.games[1].address, "example.org:7777");
  assert.equal(stats.games[1].count, 1);

  const raw = await fs.readFile(metricsPath, "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.count, 3);
  assert.equal(parsed.games["moo.sindome.org:5555"], 2);
  assert.equal(parsed.games["example.org:7777"], 1);

  await fs.rm(metricsPath, { force: true });
  await fs.rm(tempPath, { force: true });
});


import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const baseName = `multi-mud-metrics.test.${process.pid}`;

async function loadService(tag) {
  return import(`../../src/services/multi-mud-metrics.js?${tag}=${Date.now()}-${Math.random()}`);
}

async function withMetricsPath(t, suffix, fn) {
  const metricsPath = path.join(process.cwd(), "data", `${baseName}.${suffix}.json`);
  const tempPath = `${metricsPath}.tmp`;
  await fs.rm(metricsPath, { force: true });
  await fs.rm(tempPath, { force: true });
  const svc = await loadService(suffix);
  svc.setMetricsPathForTests(metricsPath);
  svc.resetMetricsForTests();

  t.after(async () => {
    svc.setMetricsPathForTests();
    svc.resetMetricsForTests();
    await fs.rm(metricsPath, { force: true });
    await fs.rm(tempPath, { force: true });
  });

  await fn({ svc, metricsPath, tempPath });
}

const tcpEntry = (address, count) => ({
  address,
  count,
  transportMode: "tcp",
  label: address
});

const tlsEntry = (address, count) => ({
  address,
  count,
  transportMode: "tls",
  label: `${address} (TLS)`
});

test("multi-mud metrics record and persist game counts", async (t) => {
  await withMetricsPath(t, "persist", async ({ svc, metricsPath }) => {
    svc.recordConnection("moo.sindome.org", 5555);
    svc.recordConnection("moo.sindome.org", 5555);
    svc.recordConnection("example.org", 7777);

    const stats = svc.connectedStats();
    assert.equal(stats.count, 3);
    assert.equal(stats.games[0].address, "moo.sindome.org:5555");
    assert.equal(stats.games[0].count, 2);
    assert.equal(stats.games[0].transportMode, "tcp");
    assert.equal(stats.games[1].address, "example.org:7777");
    assert.equal(stats.games[1].count, 1);
    assert.equal(stats.games[1].transportMode, "tcp");

    const parsed = JSON.parse(await fs.readFile(metricsPath, "utf8"));
    assert.equal(parsed.count, 3);
    assert.equal(parsed.games["moo.sindome.org:5555"], 2);
    assert.equal(parsed.games["example.org:7777"], 1);
  });
});

test("multi-mud metrics keep TLS and TCP counts separate for the same host and port", async (t) => {
  await withMetricsPath(t, "tls-split", async ({ svc, metricsPath }) => {
    svc.recordConnection("secure.example.org", 6697);
    svc.recordConnection("secure.example.org", 6697, true);
    svc.recordConnection("secure.example.org", 6697, true);

    const stats = svc.connectedStats();
    assert.equal(stats.count, 3);
    assert.deepEqual(stats.games, [
      tlsEntry("secure.example.org:6697", 2),
      tcpEntry("secure.example.org:6697", 1)
    ]);

    const parsed = JSON.parse(await fs.readFile(metricsPath, "utf8"));
    assert.equal(parsed.games["secure.example.org:6697"], 1);
    assert.equal(parsed.games["secure.example.org:6697|tls"], 2);
  });
});

test("recordConnection ignores invalid host/port values", async (t) => {
  await withMetricsPath(t, "invalid-input", async ({ svc }) => {
    svc.recordConnection("", 5555);
    svc.recordConnection("   ", 5555);
    svc.recordConnection("host", 22);
    svc.recordConnection("host", 65536);
    svc.recordConnection("host", "not-a-port");
    svc.recordConnection("host", null);

    const stats = svc.connectedStats();
    assert.equal(stats.count, 0);
    assert.deepEqual(stats.games, []);
  });
});

test("recordConnection accepts lower and upper valid port boundaries", async (t) => {
  await withMetricsPath(t, "boundaries", async ({ svc }) => {
    svc.recordConnection(" MixedCase.EXAMPLE.org ", "23");
    svc.recordConnection("mixedcase.example.org", 65535);

    const stats = svc.connectedStats();
    assert.equal(stats.count, 2);
    assert.deepEqual(stats.games, [
      tcpEntry("mixedcase.example.org:23", 1),
      tcpEntry("mixedcase.example.org:65535", 1)
    ]);
  });
});

test("connectedStats sorts by count desc then address asc", async (t) => {
  await withMetricsPath(t, "sorting", async ({ svc }) => {
    svc.recordConnection("b.example", 4444);
    svc.recordConnection("a.example", 4444);
    svc.recordConnection("b.example", 4444);
    svc.recordConnection("a.example", 4444);

    const stats = svc.connectedStats();
    assert.equal(stats.count, 4);
    assert.deepEqual(stats.games, [
      tcpEntry("a.example:4444", 2),
      tcpEntry("b.example:4444", 2)
    ]);
  });
});

test("loadMetrics handles missing and empty files", async (t) => {
  await withMetricsPath(t, "missing-empty", async ({ svc, metricsPath }) => {
    assert.deepEqual(svc.connectedStats(), { count: 0, games: [] });

    await fs.writeFile(metricsPath, "   \n\t", "utf8");
    svc.resetMetricsForTests();
    assert.deepEqual(svc.connectedStats(), { count: 0, games: [] });
  });
});

test("loadMetrics normalizes malformed parsed values", async (t) => {
  await withMetricsPath(t, "normalize", async ({ svc, metricsPath }) => {
    const payload = {
      count: "-99",
      games: {
        "Example.org:7777": "2",
        "EXAMPLE.org:abc": "9",
        "bad-entry": "3",
        "host:22": "4",
        "host:70000": "5",
        "secure.example:6697|tls": "3",
        "good.example:5555": 0,
        "good.example:6666": "-5"
      }
    };
    await fs.writeFile(metricsPath, JSON.stringify(payload), "utf8");

    svc.resetMetricsForTests();
    const stats = svc.connectedStats();
    assert.equal(stats.count, 0);
    assert.deepEqual(stats.games, [
      tlsEntry("secure.example:6697", 3),
      tcpEntry("example.org:7777", 2)
    ]);
  });
});

test("loadMetrics coerces count and rejects non-object games containers", async (t) => {
  await withMetricsPath(t, "coercion", async ({ svc, metricsPath }) => {
    await fs.writeFile(metricsPath, JSON.stringify({
      count: "12",
      games: ["not", "an", "object"]
    }), "utf8");

    svc.resetMetricsForTests();
    const stats = svc.connectedStats();
    assert.equal(stats.count, 12);
    assert.deepEqual(stats.games, []);
  });
});

test("setMetricsPathForTests resets in-memory metrics", async (t) => {
  await withMetricsPath(t, "reset-hook", async ({ svc, metricsPath }) => {
    svc.recordConnection("one.example", 4444);
    assert.equal(svc.connectedStats().count, 1);

    const secondPath = `${metricsPath}.second`;
    await fs.rm(secondPath, { force: true });
    await fs.rm(`${secondPath}.tmp`, { force: true });

    svc.setMetricsPathForTests(secondPath);
    assert.deepEqual(svc.connectedStats(), { count: 0, games: [] });

    await fs.rm(secondPath, { force: true });
    await fs.rm(`${secondPath}.tmp`, { force: true });
  });
});

async function loadServiceWithMocks(t, { fsMock, loggerMock, tag }) {
  t.mock.module("node:fs", {
    defaultExport: fsMock
  });
  t.mock.module("../../src/logger.js", {
    namedExports: {
      named: () => loggerMock
    }
  });
  const svc = await import(`../../src/services/multi-mud-metrics.js?mocked=${tag}-${Date.now()}-${Math.random()}`);
  t.after(() => {
    t.mock.restoreAll();
  });
  return svc;
}

test("loadMetrics read failure uses logger.warn when available", async (t) => {
  const logger = { warn: t.mock.fn(), error: t.mock.fn() };
  const fsMock = {
    existsSync: () => true,
    readFileSync: () => {
      throw new Error("read boom");
    },
    mkdirSync() {},
    writeFileSync() {},
    renameSync() {}
  };
  const svc = await loadServiceWithMocks(t, { fsMock, loggerMock: logger, tag: "warn-read" });
  svc.connectedStats();
  assert.equal(logger.warn.mock.callCount(), 1);
  assert.equal(logger.error.mock.callCount(), 0);
  assert.equal(logger.warn.mock.calls[0].arguments[0], "Unable to load multi-mud metrics from disk");
});

test("loadMetrics read failure falls back to logger.error when warn is missing", async (t) => {
  const logger = { error: t.mock.fn() };
  const fsMock = {
    existsSync: () => true,
    readFileSync: () => {
      throw new Error("read boom");
    },
    mkdirSync() {},
    writeFileSync() {},
    renameSync() {}
  };
  const svc = await loadServiceWithMocks(t, { fsMock, loggerMock: logger, tag: "error-read" });
  svc.connectedStats();
  assert.equal(logger.error.mock.callCount(), 1);
  assert.equal(logger.error.mock.calls[0].arguments[0], "Unable to load multi-mud metrics from disk");
});

test("saveMetrics write failure does not throw when logger has no warn/error", async (t) => {
  const logger = {};
  const fsMock = {
    existsSync: () => true,
    readFileSync: () => "",
    mkdirSync() {},
    writeFileSync: () => {
      throw new Error("write boom");
    },
    renameSync() {}
  };
  const svc = await loadServiceWithMocks(t, { fsMock, loggerMock: logger, tag: "noop-write" });
  assert.doesNotThrow(() => {
    svc.recordConnection("example.org", 7777);
  });
});

test("saveMetrics rename failure logs through warn fallback path", async (t) => {
  const logger = { warn: t.mock.fn(), error: t.mock.fn() };
  const fsMock = {
    existsSync: () => true,
    readFileSync: () => "",
    mkdirSync() {},
    writeFileSync() {},
    renameSync: () => {
      throw new Error("rename boom");
    }
  };
  const svc = await loadServiceWithMocks(t, { fsMock, loggerMock: logger, tag: "warn-rename" });
  svc.recordConnection("example.org", 7777);
  assert.equal(logger.warn.mock.callCount(), 1);
  assert.equal(logger.error.mock.callCount(), 0);
  assert.equal(logger.warn.mock.calls[0].arguments[0], "Unable to persist multi-mud metrics to disk");
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { named } from "../logger.js";

const logger = named("services/multi-mud-metrics");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultMetricsPath = path.join(__dirname, "..", "..", "data", "multi-mud-metrics.json");
let metricsPath = defaultMetricsPath;

const metrics = {
  count: 0,
  games: {}
};

let loaded = false;

function normalizeHost(host) {
  return String(host || "").trim().toLowerCase();
}

function normalizePort(port) {
  const numeric = Number.parseInt(String(port || ""), 10);
  if (!Number.isFinite(numeric) || numeric < 23 || numeric > 65535) {
    return null;
  }
  return numeric;
}

function normalizeAddress(host, port) {
  const normalizedHost = normalizeHost(host);
  const normalizedPort = normalizePort(port);
  if (!normalizedHost || normalizedPort == null) {
    return null;
  }
  return `${normalizedHost}:${normalizedPort}`;
}

function normalizeTransportMode(useTls) {
  return useTls === true ? "tls" : "tcp";
}

function normalizeMetricKey(host, port, useTls = false) {
  const address = normalizeAddress(host, port);
  if (!address) {
    return null;
  }
  return normalizeTransportMode(useTls) === "tls" ? `${address}|tls` : address;
}

function parseMetricKey(key) {
  const rawKey = String(key || "");
  const [addressPart, transportPart] = rawKey.split("|");
  const separator = addressPart.lastIndexOf(":");
  if (separator < 0) {
    return null;
  }
  const host = addressPart.slice(0, separator);
  const port = addressPart.slice(separator + 1);
  const address = normalizeAddress(host, port);
  if (!address) {
    return null;
  }
  const transportMode = transportPart === "tls" ? "tls" : "tcp";
  return {
    address,
    key: transportMode === "tls" ? `${address}|tls` : address,
    transportMode
  };
}

function loadMetrics() {
  if (loaded) {
    return;
  }
  loaded = true;
  try {
    if (!fs.existsSync(metricsPath)) {
      return;
    }
    const raw = fs.readFileSync(metricsPath, "utf8");
    if (!raw || !raw.trim()) {
      return;
    }
    const parsed = JSON.parse(raw);
    const parsedCount = Number.parseInt(String(parsed?.count || 0), 10);
    metrics.count = Number.isFinite(parsedCount) && parsedCount >= 0 ? parsedCount : 0;
    const parsedGames = parsed?.games && typeof parsed.games === "object" ? parsed.games : {};
    const normalizedGames = {};
    for (const [key, value] of Object.entries(parsedGames)) {
      const parsedKey = parseMetricKey(key);
      if (!parsedKey) {
        continue;
      }
      const numValue = Number.parseInt(String(value || 0), 10);
      if (!Number.isFinite(numValue) || numValue < 1) {
        continue;
      }
      normalizedGames[parsedKey.key] = (normalizedGames[parsedKey.key] || 0) + numValue;
    }
    metrics.games = normalizedGames;
  } catch (err) {
    const warn = typeof logger.warn === "function"
      ? logger.warn.bind(logger)
      : typeof logger.error === "function"
        ? logger.error.bind(logger)
        : () => {};
    warn("Unable to load multi-mud metrics from disk", err);
  }
}

function saveMetrics() {
  try {
    const dir = path.dirname(metricsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${metricsPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(metrics, null, 2), "utf8");
    fs.renameSync(tempPath, metricsPath);
  } catch (err) {
    const warn = typeof logger.warn === "function"
      ? logger.warn.bind(logger)
      : typeof logger.error === "function"
        ? logger.error.bind(logger)
        : () => {};
    warn("Unable to persist multi-mud metrics to disk", err);
  }
}

export function recordConnection(host, port, useTls = false) {
  loadMetrics();
  const key = normalizeMetricKey(host, port, useTls);
  if (!key) {
    return;
  }
  metrics.count += 1;
  metrics.games[key] = (metrics.games[key] || 0) + 1;
  saveMetrics();
}

export function connectedStats() {
  loadMetrics();
  const games = Object.entries(metrics.games)
    .map(([key, count]) => {
      const parsedKey = parseMetricKey(key);
      if (!parsedKey) return null;
      return {
        address: parsedKey.address,
        count,
        transportMode: parsedKey.transportMode,
        label: parsedKey.transportMode === "tls" ? `${parsedKey.address} (TLS)` : parsedKey.address
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count
      || a.address.localeCompare(b.address)
      || a.transportMode.localeCompare(b.transportMode));
  return {
    count: metrics.count,
    games
  };
}

// Test hook for integration/unit isolation.
export function resetMetricsForTests() {
  metrics.count = 0;
  metrics.games = {};
  loaded = false;
}

export function setMetricsPathForTests(nextPath) {
  metricsPath = nextPath || defaultMetricsPath;
  resetMetricsForTests();
}

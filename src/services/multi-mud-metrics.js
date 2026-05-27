import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { named } from "../logger.js";

const logger = named("services/multi-mud-metrics");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const metricsPath = path.join(__dirname, "..", "..", "data", "multi-mud-metrics.json");

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
      const [host, port] = String(key).split(":");
      const normalizedKey = normalizeAddress(host, port);
      if (!normalizedKey) {
        continue;
      }
      const numValue = Number.parseInt(String(value || 0), 10);
      if (!Number.isFinite(numValue) || numValue < 1) {
        continue;
      }
      normalizedGames[normalizedKey] = numValue;
    }
    metrics.games = normalizedGames;
  } catch (err) {
    logger.warn("Unable to load multi-mud metrics from disk", err);
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
    logger.warn("Unable to persist multi-mud metrics to disk", err);
  }
}

export function recordConnection(host, port) {
  loadMetrics();
  const key = normalizeAddress(host, port);
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
    .map(([address, count]) => ({ address, count }))
    .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));
  return {
    count: metrics.count,
    games
  };
}


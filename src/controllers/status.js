/* c8 ignore start */
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../config/index.js";
import { named } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const logger = named("controllers/" + path.basename(__filename, ".js"));

function normalizeStatusServiceUrl(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = "https://" + candidate;
  }

  const parsed = new URL(candidate);
  if (!parsed.pathname || parsed.pathname === "/") {
    parsed.pathname = "/moo/status/";
  }
  return parsed.toString();
}

const STATUS_URL = normalizeStatusServiceUrl(config.status?.serviceUrl);
const STATUS_ENABLED = Boolean(STATUS_URL);
const CHECK_INTERVAL = 15000;

const MOO_STATUS_ENUM = {
  UNKNOWN: "UNKNOWN",
  OK: "OK",
  WEBCLIENT_DOWN: "CLIENT_DOWN",
  WEBSITE_DOWN: "SITE_DOWN",
  MOO_OFFLINE: "MOO_DOWN",
  SEVERE_LAG: "LAG",
  NETWORK_ISSUE: "NETWORK"
};

let lastStatus = {
  message: STATUS_ENABLED ? "moo status unknown, not checked yet" : "status service disabled",
  cpu: 0,
  memory: 0,
  checked: 0,
  users: 0,
  interval: 0,
  state: STATUS_ENABLED ? MOO_STATUS_ENUM.UNKNOWN : MOO_STATUS_ENUM.UNCHECKED
};

function handleHealthCheckError(err) {
  const status = {
    ...lastStatus,
    checked: Date.now(),
    state: MOO_STATUS_ENUM.WEBSITE_DOWN
  };
  if (err.code == "ECONNREFUSED") {
    status.message = "moo status unknown, status service is probably down (or restarting)";
  } else if (err.code == "ETIMEOUT") {
    status.message = "moo status unknown, status service took too long to respond";
  } else if (err.code == "ENOTFOUND") {
    status.message = "moo status unknown, status service host unreachable from webclient server";
  } else {
    status.message = "moo status unknown, unexpected error " + err.code;
  }
  return status;
}

async function healthCheck() {
  if (!STATUS_ENABLED) {
    return lastStatus;
  }
  logger.debug("getting health status from " + STATUS_URL);
  try {
    const res = await fetch(STATUS_URL);
    const status = await res.json();
    lastStatus = status;
  } catch (err) {
    logger.error("failed to get status", err);
    lastStatus = handleHealthCheckError(err);
  }
  return lastStatus;
}

if (STATUS_ENABLED) {
  setInterval(healthCheck, CHECK_INTERVAL);
  setTimeout(healthCheck, 1000);
}

export function get(req, res) {
  res.json(lastStatus);
  return lastStatus;
}
/* c8 ignore stop */

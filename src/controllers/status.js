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
  if (err?.code == "ECONNREFUSED") {
    status.message = "moo status unknown, status service is probably down (or restarting)";
  } else if (err?.code == "ETIMEOUT") {
    status.message = "moo status unknown, status service took too long to respond";
  } else if (err?.code == "ENOTFOUND") {
    status.message = "moo status unknown, status service host unreachable from webclient server";
  } else {
    status.message = "moo status unknown, status service returned an unexpected response";
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
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const bodyText = await res.text();

    if (!res.ok) {
      logger.warn(
        `status service request failed: url=${STATUS_URL} status=${res.status} contentType=${contentType || "unknown"} bodyPreview=${JSON.stringify(bodyText.slice(0, 160))}`
      );
      lastStatus = handleHealthCheckError({ code: "EBADSTATUS" });
      return lastStatus;
    }

    if (!contentType.includes("application/json")) {
      logger.warn(
        `status service returned non-JSON response: url=${STATUS_URL} status=${res.status} contentType=${contentType || "unknown"} bodyPreview=${JSON.stringify(bodyText.slice(0, 160))}`
      );
      lastStatus = handleHealthCheckError({ code: "EBADCONTENTTYPE" });
      return lastStatus;
    }

    let status;
    try {
      status = JSON.parse(bodyText);
    } catch {
      logger.warn(
        `status service returned invalid JSON: url=${STATUS_URL} status=${res.status} bodyPreview=${JSON.stringify(bodyText.slice(0, 160))}`
      );
      lastStatus = handleHealthCheckError({ code: "EBADJSON" });
      return lastStatus;
    }

    lastStatus = status;
  } catch (err) {
    logger.warn(`failed to get status: url=${STATUS_URL} code=${err?.code || "UNKNOWN"} message=${err?.message || "no message"}`);
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

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

export function createStatusPoller({ serviceUrl, logger, fetchStatus = (...args) => fetch(...args), intervalMs = 15000, timeoutMs = 5000 }) {
  const STATUS_URL = normalizeStatusServiceUrl(serviceUrl);
  const STATUS_ENABLED = Boolean(STATUS_URL);

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
    state: STATUS_ENABLED ? MOO_STATUS_ENUM.UNKNOWN : undefined
  };

  function handleHealthCheckError(code) {
    const status = {
      ...lastStatus,
      checked: Date.now(),
      state: MOO_STATUS_ENUM.WEBSITE_DOWN
    };
    if (code === "ECONNREFUSED") {
      status.message = "moo status unknown, status service is probably down (or restarting)";
    } else if (code === "ETIMEOUT" || code === "ETIMEDOUT") {
      status.message = "moo status unknown, status service took too long to respond";
    } else if (code === "ENOTFOUND") {
      status.message = "moo status unknown, status service host unreachable from webclient server";
    } else {
      status.message = "moo status unknown, status service returned an unexpected response";
    }
    return status;
  }

  function hasRequiredStatusShape(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    if (typeof value.message !== "string") return false;
    if (!Number.isFinite(value.cpu)) return false;
    if (!Number.isFinite(value.memory)) return false;
    if (!Number.isFinite(value.checked)) return false;
    if (!Number.isFinite(value.users)) return false;
    if (!Number.isFinite(value.interval)) return false;
    if (value.state !== undefined && typeof value.state !== "string") return false;
    return true;
  }

  async function healthCheck(signal, cancellation) {
    if (!STATUS_ENABLED) {
      return lastStatus;
    }
    logger.debug("getting health status from " + STATUS_URL);
    try {
      const res = await fetchStatus(STATUS_URL, { signal });
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const bodyText = await res.text();
      signal.throwIfAborted();

      if (!res.ok) {
        logger.warn(
          `status service request failed: url=${STATUS_URL} status=${res.status} contentType=${contentType || "unknown"} bodyPreview=${JSON.stringify(bodyText.slice(0, 160))}`
        );
        lastStatus = handleHealthCheckError("EBADSTATUS");
        return lastStatus;
      }

      if (!contentType.includes("application/json")) {
        logger.warn(
          `status service returned non-JSON response: url=${STATUS_URL} status=${res.status} contentType=${contentType || "unknown"} bodyPreview=${JSON.stringify(bodyText.slice(0, 160))}`
        );
        lastStatus = handleHealthCheckError("EBADCONTENTTYPE");
        return lastStatus;
      }

      let status;
      try {
        status = JSON.parse(bodyText);
      } catch {
        logger.warn(
          `status service returned invalid JSON: url=${STATUS_URL} status=${res.status} bodyPreview=${JSON.stringify(bodyText.slice(0, 160))}`
        );
        lastStatus = handleHealthCheckError("EBADJSON");
        return lastStatus;
      }

      if (!hasRequiredStatusShape(status)) {
        logger.warn(
          `status service returned unexpected schema: url=${STATUS_URL} bodyPreview=${JSON.stringify(bodyText.slice(0, 160))}`
        );
        lastStatus = handleHealthCheckError("EBADSCHEMA");
        return lastStatus;
      }

      lastStatus = status;
    } catch (error) {
      if (cancellation.aborted) return lastStatus;
      const err = signal.reason?.name === "TimeoutError" ? { code: "ETIMEOUT", message: signal.reason.message } : error;
      const code = err?.code ?? err?.cause?.code;
      logger.warn(`failed to get status: url=${STATUS_URL} code=${code || "UNKNOWN"} message=${err?.message || "no message"}`);
      lastStatus = handleHealthCheckError(code);
    }
    return lastStatus;
  }

  let running = false;
  let interval;
  let initial;
  let pending;
  let request;
  function refresh() {
    if (!pending) {
      request = new AbortController();
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
      const job = healthCheck(signal, request.signal).finally(() => {
        if (pending === job) { pending = undefined; request = undefined; }
      });
      pending = job;
    }
    return pending;
  }

  return {
    refresh,
    get: () => lastStatus,
    start() {
      if (!STATUS_ENABLED || running) return;
      running = true;
      interval = setInterval(refresh, intervalMs);
      initial = setTimeout(refresh, 1000);
      interval?.unref?.();
      initial?.unref?.();
    },
    stop() {
      running = false;
      clearInterval(interval);
      clearTimeout(initial);
      interval = initial = undefined;
      request?.abort();
      request = pending = undefined;
    }
  };
}

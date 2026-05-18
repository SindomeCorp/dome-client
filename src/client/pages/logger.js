const endpoint = window.LOG_ENDPOINT;

function send(level, args) {
  const log = console[level] || console.log;
  log(...args);
  if (!endpoint) {
    return;
  }
  try {
    const message = args
      .map(a => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    const payload = JSON.stringify({ level, message });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, payload);
    } else if (typeof fetch === "function") {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload
      });
    }
  } catch {
    // ignore logging errors
  }
}

function makeLogger(level) {
  return (...args) => {
    send(level, args);
  };
}

const logger = {
  error: makeLogger("error"),
  warn: makeLogger("warn"),
  info: makeLogger("info"),
  log: makeLogger("log"),
  debug: makeLogger("debug")
};

export default logger;

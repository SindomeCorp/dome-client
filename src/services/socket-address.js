export function parseSocketPort(rawPort) {
  const parsed = Number.parseInt(String(rawPort || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 23 || parsed > 65535) {
    return null;
  }
  return parsed;
}

export function parseTransportMode(rawMode) {
  return String(rawMode || "").trim().toLowerCase() === "tls" ? "tls" : "tcp";
}

export function resolveGameAddress(socket, {
  fallbackHost,
  fallbackPort,
  multiMudEnabled,
  mudTlsEnabled = false
}) {
  if (!multiMudEnabled) {
    return { host: fallbackHost, port: fallbackPort, useTls: mudTlsEnabled === true };
  }
  const query = socket.handshake?.query || {};
  const host = String(query.host || "").trim();
  const port = parseSocketPort(query.port);
  if (!host || port == null) {
    return { host: fallbackHost, port: fallbackPort, useTls: false };
  }
  const useTls = mudTlsEnabled === true && parseTransportMode(query.transport_mode) === "tls";
  return { host, port, useTls };
}

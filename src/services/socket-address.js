export function parseSocketPort(rawPort) {
  const parsed = Number.parseInt(String(rawPort || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 23 || parsed > 65535) {
    return null;
  }
  return parsed;
}

export function resolveGameAddress(socket, {
  fallbackHost,
  fallbackPort,
  multiMudEnabled
}) {
  if (!multiMudEnabled) {
    return { host: fallbackHost, port: fallbackPort };
  }
  const query = socket.handshake?.query || {};
  const host = String(query.host || "").trim();
  const port = parseSocketPort(query.port);
  if (!host || port == null) {
    return { host: fallbackHost, port: fallbackPort };
  }
  return { host, port };
}

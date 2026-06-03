const DEFAULT_MUD_HOST = "moo.sindome.org";
const DEFAULT_MUD_PORT = "5555";

function buildMooConnectCommand({ username, password }) {
  if (username && password) {
    return `connect ${username} ${password}`;
  }
  if (username) {
    return `connect ${username}`;
  }
  return "";
}

function resolvePlayerClientAddress({ host, port }) {
  const resolvedHost = String(host || "").trim() || DEFAULT_MUD_HOST;
  const resolvedPort = String(port || "").trim() || DEFAULT_MUD_PORT;
  return { host: resolvedHost, port: resolvedPort };
}

function buildPlayerClientUrl({ host, port }) {
  const address = resolvePlayerClientAddress({ host, port });
  const params = new URLSearchParams();
  params.set("gh", address.host);
  params.set("gp", address.port);
  return `/player-client/?${params.toString()}`;
}

export {
  DEFAULT_MUD_HOST,
  DEFAULT_MUD_PORT,
  buildMooConnectCommand,
  buildPlayerClientUrl,
  resolvePlayerClientAddress
};

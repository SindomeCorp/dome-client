import net from "node:net";

export function resolveClientIpFromRequest(req, { proxied = false } = {}) {
  const forwardedFor = req?.headers?.["x-forwarded-for"];
  if (proxied && forwardedFor) {
    return normalizeClientIp(Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(",")[0]);
  }
  return normalizeClientIp(req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress || "");
}

export function normalizeClientIp(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/^::ffff:/i, "");
}

export function loadIpBlocklist({ filePath, fs, logger }) {
  if (!filePath) {
    return createDisabledMatcher();
  }

  const list = new net.BlockList();
  let size = 0;

  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    logger.warn("Unable to load IP blocklist from " + filePath, err);
    return createMatcher(list, size);
  }

  raw.split(/\r?\n/).forEach((line, index) => {
    const entry = normalizeClientIp(line.split("#")[0]);
    if (!entry) {
      return;
    }
    const family = net.isIP(entry);
    if (family === 0) {
      logger.warn("Ignoring invalid IP blocklist entry " + filePath + ":" + (index + 1) + " " + entry);
      return;
    }
    list.addAddress(entry, family === 6 ? "ipv6" : "ipv4");
    size += 1;
  });

  logger.info("Loaded " + size + " IP blocklist entries from " + filePath);
  return createMatcher(list, size);
}

function createMatcher(list, size) {
  return {
    size,
    has(ip) {
      const normalized = normalizeClientIp(ip);
      const family = net.isIP(normalized);
      return Boolean(list && normalized && family !== 0 && list.check(normalized, family === 6 ? "ipv6" : "ipv4"));
    }
  };
}

function createDisabledMatcher() {
  return {
    size: 0,
    has() {
      return false;
    }
  };
}

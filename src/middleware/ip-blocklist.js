import { resolveClientIpFromRequest } from "../services/ip-blocklist.js";

export function createIpBlocklistMiddleware({ blocklist, logger, proxied = false }) {
  return function ipBlocklist(req, res, next) {
    const ip = resolveClientIpFromRequest(req, { proxied });
    if (blocklist?.has(ip)) {
      logger.warn("Blocked request from " + ip + " to " + (req.originalUrl || req.url || ""));
      res.status(403).send("Forbidden");
      return;
    }
    next();
  };
}

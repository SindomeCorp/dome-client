import { named } from "../logger.js";

const fallbackLogger = named("services/socket-utils");

/**
 * Handle errors from reverse DNS lookups on socket connections.
 *
 * @param {Error & {code?: string}} err - The DNS error encountered.
 * @param {object} socket - The client socket associated with the lookup.
 * @param {string} address - The IP address that was queried.
 */
export function dnsErrorHandler(err, socket, address) {
  const logger = socket.logger || fallbackLogger;
  if (err.code === "ENOTIMP") {
    logger.debug("reverse dns not implemented");
  } else if (["NOTFOUND", "SERVFAIL", "TIMEOUT"].includes(err.code)) {
    socket.logUser(socket, "DNS", [err.code]);
  } else {
    logger.error("exception while resolving name for ip " + address);
    socket.logError(socket, err);
  }
}


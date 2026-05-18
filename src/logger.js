import { createLogger, format, transports } from "winston";
import util from "node:util";
import env from "./env.js";

const logger = createLogger({
  level: env.LOG_LEVEL,
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, namespace, ...meta }) => {
      const ns = namespace ? ` ${namespace}` : "";
      const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      return `${timestamp} [${level}]${ns} ${message}${extra}`;
    })
  ),
  transports: [new transports.Console()]
});

export function named(namespace) {
  return logger.child({ namespace });
}

export function inspect(obj) {
  logger.debug(util.inspect(obj, { depth: null }));
}

export default logger;

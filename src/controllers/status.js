import config from "../config/index.js";
import { named } from "../logger.js";

import { createStatusPoller } from "../services/status-poller.js";

const logger = named("controllers/status");

const poller = createStatusPoller({ serviceUrl: config.status.serviceUrl, logger });
export const refreshStatus = poller.refresh;
export const startStatusPolling = poller.start;
export const stopStatusPolling = poller.stop;

export function get(_req, res) {
  const status = poller.get();
  res.json(status);
  return status;
}

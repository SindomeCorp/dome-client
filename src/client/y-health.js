import { logger, SOCKET_STATE_ENUM } from "./b-variables.js";
import { createHealthGraphRenderer } from "./health-graph-renderer.js";
import { createHealthPanelController } from "./health-panel-controller.js";
import { createHealthStatusPresenter } from "./health-status-presenter.js";
import {
  createPollingErrorHealth,
  diagnoseConnectionError
} from "./health-status.js";

export function setupHealthCheck({
  client,
  doc = globalThis.document,
  fetchFn = (...args) => globalThis.fetch(...args),
  log = logger,
  setIntervalFn = (...args) => globalThis.setInterval(...args),
  clearIntervalFn = (...args) => globalThis.clearInterval(...args),
  setTimeoutFn = (...args) => globalThis.setTimeout(...args),
  clearTimeoutFn = (...args) => globalThis.clearTimeout(...args)
} = {}) {
  if (!client.healthDisplay || !client.healthDetail) {
    return undefined;
  }

  const showConnectionHelp = (helpType) => {
    // @TODO: make help to show ...
    log.info("showing help for: " + helpType);
  };

  const statusPresenter = createHealthStatusPresenter({
    statusDisplay: client.statusDisplay
  });
  const panelController = createHealthPanelController({
    healthDisplay: client.healthDisplay,
    healthDetail: client.healthDetail,
    setTimeoutFn,
    clearTimeoutFn
  });
  const graphRenderer = createHealthGraphRenderer({
    client,
    doc,
    onStatusChange(message, { persist = false } = {}) {
      statusPresenter.showStatus(message, { persist });
    }
  });

  const updatePerfBufferFlag = () => {
    if (client.preferences.performanceBuffer != 0) {
      client.perfBufferFlag.setAttribute(
        "title",
        "Scrollback limited to " + client.preferences.performanceBuffer + " lines"
      );
      client.perfBufferFlag.classList.remove("hide");
    }
  };

  const refreshStatus = () => {
    updatePerfBufferFlag();

    return fetchFn("/moo/status/")
      .then((res) => res.json())
      .then((health) => {
        graphRenderer.renderHealth(health);
        return health;
      })
      .catch((err) => {
        const health = createPollingErrorHealth(err);
        log.error(err);
        graphRenderer.renderHealth(health);
        return health;
      });
  };

  const troubleshootConnection = (error) => {
    const lastHealth = client.gameHealth.at?.(-1) ?? client.gameHealth;
    const diagnosis = diagnoseConnectionError(error, lastHealth);
    if (diagnosis.helpType) {
      showConnectionHelp(diagnosis.helpType);
    }

    return diagnosis.message;
  };

  const handleSocketError = (error) => {
    let msg = "";
    if (error) {
      if (error.msg) {
        msg = error.msg;
      } else if (error.code) {
        msg = error.code;
      }

      if (client.socketState != SOCKET_STATE_ENUM.CONNECTED) {
        msg = troubleshootConnection(error);
      }
    }

    if (error) {
      log.error(error);
    }
    if (msg) {
      statusPresenter.showStatus("ERROR: " + msg, { persist: true });
    }
  };

  let pollingInterval = setIntervalFn(refreshStatus, 30000);

  const controller = {
    destroy() {
      panelController.destroy();
      if (pollingInterval != null) {
        clearIntervalFn(pollingInterval);
        pollingInterval = null;
      }
    },
    handleSocketError,
    hidePanel: panelController.hidePanel,
    refreshStatus,
    showPanel: panelController.showPanel,
    showStatus: statusPresenter.showStatus,
    togglePanel: panelController.togglePanel
  };

  client.health = controller;
  refreshStatus();

  return controller;
}

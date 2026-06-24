import logger from "./logger.js";
import { store } from "../core/store.js";
import { savedUsersStore } from "../features/connection/saved-users-store.js";
import {
  DEFAULT_MUD_HOST,
  DEFAULT_MUD_PORT
} from "../features/connection/client-connect-intent.js";
import {
  bindConnectPageActions,
  bindConnectPanelNavigation,
  bindSavedUserPicker,
  createConnectAction,
  getParameterByName,
  initializeAddressFields,
  initializeTransportModeField,
  setupConnectPageChrome
} from "../features/connection/client-connect-workflows.js";

document.addEventListener("DOMContentLoaded", () => {
  setupConnectPageChrome({ doc: document, win: window });
  initializeAddressFields({
    doc: document,
    host: DEFAULT_MUD_HOST,
    port: DEFAULT_MUD_PORT
  });
  initializeTransportModeField({
    doc: document,
    store,
    host: DEFAULT_MUD_HOST,
    port: DEFAULT_MUD_PORT
  });

  const autoUser = getParameterByName("auto", window.location.search);
  const usernames = savedUsersStore.getUsernames();
  const connect = createConnectAction({
    doc: document,
    win: window,
    store,
    savedUsersStore
  });

  bindSavedUserPicker({
    doc: document,
    win: window,
    logger,
    savedUsersStore,
    usernames,
    autoUser
  });

  bindConnectPageActions({
    doc: document,
    win: window,
    store,
    connect,
    guestConnectCommand: window.guestConnectCommand
  });

  if (autoUser) {
    logger.info(`Auto-connect parameter: ${autoUser}`);
    if (savedUsersStore.getUser(autoUser)) {
      connect();
    }
  }

  bindConnectPanelNavigation({ doc: document });
});

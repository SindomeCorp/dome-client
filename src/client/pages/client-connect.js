import logger from "./logger.js";
import { store } from "../store.js";
import { savedUsersStore } from "../saved-users-store.js";
import {
  DEFAULT_MUD_HOST,
  DEFAULT_MUD_PORT
} from "../client-connect-intent.js";
import {
  bindConnectPageActions,
  bindConnectPanelNavigation,
  bindSavedUserPicker,
  createConnectAction,
  getParameterByName,
  initializeAddressFields,
  setupConnectPageChrome
} from "../client-connect-workflows.js";

document.addEventListener("DOMContentLoaded", () => {
  setupConnectPageChrome({ doc: document, win: window });
  initializeAddressFields({
    doc: document,
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

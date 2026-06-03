const createClientCapabilities = ({ client, doc = globalThis.document, win = globalThis.window }) => ({
  preferences: {
    readPreferences: client.readPreferences?.bind(client),
    applyTransparentOverlayPreference: client.applyTransparentOverlayPreference?.bind(client)
  },
  socketOutput: {
    buffer: client.buffer,
    parseSocketData: client.parseSocketData,
    scrollBuffer: client.scrollBuffer?.bind(client)
  },
  uiControls: {
    buttons: {
      reconnect: client.reconnectButton,
      save: client.saveButton,
      scroll: client.scrollButton,
      clear: client.clearButton,
      shortcuts: client.shortcutsButton,
      clientOptions: client.clientOptionsButton
    },
    overlays: {
      clearBuffer: client.clearBufferOverlay,
      shortcuts: client.shortcutsOverlay,
      clientOptions: client.clientOptionsOverlay,
      disconnect: client.disconnectView
    }
  },
  editor: {
    listView: client.editorListView,
    spawned: client.spawned,
    getSocket: () => client.socket
  },
  health: {
    display: client.healthDisplay,
    detail: client.healthDetail,
    statusDisplay: client.statusDisplay,
    perfBufferFlag: client.perfBufferFlag
  },
  autocomplete: {
    inputReader: client.inputReader,
    userType: client.userType
  },
  environment: {
    doc,
    win
  }
});

export { createClientCapabilities };

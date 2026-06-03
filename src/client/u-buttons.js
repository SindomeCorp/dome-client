import { logger } from "./b-variables.js";
import { setupSocket } from "./g-socket-lifecycle.js";
import { refreshClientOptions } from "./pages/client-options.js";
import {
  bindClearBufferControls,
  bindCloseButton,
  bindEscapeOverlayClose,
  bindReconnectButton,
  bindSaveLogButtons,
  bindToggleOverlayButton,
  toElement
} from "./button-workflows.js";
import { attachImagePreview, toggleImagePreview } from "./image-preview.js";

export function setupConnectionButtons({ client, setupSocketFn = setupSocket } = {}) {
  client.reconnectButton = toElement(client.reconnectButton);
  bindReconnectButton({ button: client.reconnectButton, client, setupSocket: setupSocketFn });
}

export function setupLogButtons({ client } = {}) {
  bindSaveLogButtons({ buttons: client.saveButton, client, logger });
}

export function setupOverlayButtons({ client, doc = globalThis.document } = {}) {
  client.clearButton = toElement(client.clearButton);
  client.clearBufferOverlay = toElement(client.clearBufferOverlay);
  client.clearBufferConfirmButton = toElement(client.clearBufferConfirmButton);
  client.clearBufferCancelButton = toElement(client.clearBufferCancelButton);
  bindClearBufferControls({
    client,
    button: client.clearButton,
    overlay: client.clearBufferOverlay,
    confirmButton: client.clearBufferConfirmButton,
    cancelButton: client.clearBufferCancelButton
  });

  client.scrollButton = toElement(client.scrollButton);
  if (client.scrollButton && client.onToggleAutoScroll) {
    client.scrollButton.addEventListener("click", client.onToggleAutoScroll);
  }

  client.shortcutsButton = toElement(client.shortcutsButton);
  client.shortcutsOverlay = toElement(client.shortcutsOverlay);
  bindToggleOverlayButton({
    button: client.shortcutsButton,
    overlay: client.shortcutsOverlay,
    closeOnAnyOverlayClick: true
  });

  client.clientOptionsButton = toElement(client.clientOptionsButton);
  client.clientOptionsOverlay = toElement(client.clientOptionsOverlay);
  bindToggleOverlayButton({
    button: client.clientOptionsButton,
    overlay: client.clientOptionsOverlay,
    onOpen: refreshClientOptions
  });

  client.clientOptionsClose = toElement(client.clientOptionsClose);
  bindCloseButton({ button: client.clientOptionsClose, overlay: client.clientOptionsOverlay });
  bindEscapeOverlayClose({
    documentRef: doc,
    overlays: [client.clientOptionsOverlay, client.shortcutsOverlay, client.clearBufferOverlay]
  });
}

export function setupImageButtons({ client } = {}) {
  client.attachImage = function(elem, imageId, url) {
    attachImagePreview({
      elem,
      imageId,
      url,
      parseYouTubeID: client.parseYouTubeID,
      buffer: client.buffer
    });
  };

  client.toggleImage = function(control, imageId, imageURL) {
    toggleImagePreview({
      control,
      buffer: client.buffer,
      imageId,
      imageURL,
      attachImage: client.attachImage,
      logger
    });
  };
}

export function setupButtons({
  client,
  doc = globalThis.document,
  setupSocketFn = setupSocket
} = {}) {
  setupConnectionButtons({ client, setupSocketFn });
  setupLogButtons({ client });
  setupOverlayButtons({ client, doc });
  setupImageButtons({ client });
}

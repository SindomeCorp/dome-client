import { dome, logger } from "./b-variables.js";
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

export function setupButtons({ client = dome, doc = globalThis.document } = {}) {
  client.reconnectButton = toElement(client.reconnectButton);
  bindReconnectButton({ button: client.reconnectButton, client });
  bindSaveLogButtons({ buttons: client.saveButton, client, logger });

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

dome.setupButtons = () => setupButtons({ client: dome });

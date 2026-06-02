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

dome.setupButtons = function() {
  dome.reconnectButton = toElement(dome.reconnectButton);
  bindReconnectButton({ button: dome.reconnectButton, client: dome });
  bindSaveLogButtons({ buttons: dome.saveButton, client: dome, logger });

  dome.clearButton = toElement(dome.clearButton);
  dome.clearBufferOverlay = toElement(dome.clearBufferOverlay);
  dome.clearBufferConfirmButton = toElement(dome.clearBufferConfirmButton);
  dome.clearBufferCancelButton = toElement(dome.clearBufferCancelButton);
  bindClearBufferControls({
    client: dome,
    button: dome.clearButton,
    overlay: dome.clearBufferOverlay,
    confirmButton: dome.clearBufferConfirmButton,
    cancelButton: dome.clearBufferCancelButton
  });

  dome.scrollButton = toElement(dome.scrollButton);
  if (dome.scrollButton && dome.onToggleAutoScroll) {
    dome.scrollButton.addEventListener("click", dome.onToggleAutoScroll);
  }

  dome.shortcutsButton = toElement(dome.shortcutsButton);
  dome.shortcutsOverlay = toElement(dome.shortcutsOverlay);
  bindToggleOverlayButton({
    button: dome.shortcutsButton,
    overlay: dome.shortcutsOverlay,
    closeOnAnyOverlayClick: true
  });

  dome.clientOptionsButton = toElement(dome.clientOptionsButton);
  dome.clientOptionsOverlay = toElement(dome.clientOptionsOverlay);
  bindToggleOverlayButton({
    button: dome.clientOptionsButton,
    overlay: dome.clientOptionsOverlay,
    onOpen: refreshClientOptions
  });

  dome.clientOptionsClose = toElement(dome.clientOptionsClose);
  bindCloseButton({ button: dome.clientOptionsClose, overlay: dome.clientOptionsOverlay });
  bindEscapeOverlayClose({
    documentRef: document,
    overlays: [dome.clientOptionsOverlay, dome.shortcutsOverlay, dome.clearBufferOverlay]
  });

  dome.attachImage = function(elem, imageId, url) {
    attachImagePreview({
      elem,
      imageId,
      url,
      parseYouTubeID: dome.parseYouTubeID,
      buffer: dome.buffer
    });
  };

  dome.toggleImage = function(control, imageId, imageURL) {
    toggleImagePreview({
      control,
      buffer: dome.buffer,
      imageId,
      imageURL,
      attachImage: dome.attachImage,
      logger
    });
  };
};

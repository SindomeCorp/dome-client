import { buildLogDownloadFilename, buildLogDownloadHtml } from "./log-download.js";

export const toElement = el => (el && el.nodeType === 1 ? el : el?.[0]);

const toArray = value => {
  if (!value) {
    return [];
  }

  return value.length !== undefined ? value : [value];
};

export function bindReconnectButton({ button, client, setupSocket }) {
  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    client.socket?.disconnect?.();
    client.resetSdwcNowrapState?.();
    client.resetAnsiRendererState?.();
    client.socket?.off?.("data", client.parseSocketData);
    client.socket = setupSocket({ client });
    client.socket.on("data", client.parseSocketData);
  });
}

export function bindSaveLogButtons({ buttons, client, logger }) {
  const saveButtons = toArray(buttons);
  if (saveButtons.length === 0) {
    return;
  }

  const warnUnsupported = () => logger?.warn?.("Log download is not supported in this environment.");
  const handler = event => {
    event?.preventDefault?.();
    if (typeof document === "undefined" || typeof Blob === "undefined") {
      warnUnsupported();
      return;
    }

    const filename = buildLogDownloadFilename({
      now: new Date(),
      isMultiMud: globalThis.isMultiMud,
      gameName: globalThis.gameName
    });
    const htmlDocument = buildLogDownloadHtml({
      bufferHtml: client.buffer?.innerHTML ?? "",
      logExportCss: typeof window !== "undefined" ? (window.__LOG_EXPORT_CSS__ || "") : "",
      inlineLogCss: client.preferences?.inlineLogCss !== false
    });

    if (typeof window !== "undefined" && window.DomeNative && typeof window.DomeNative.downloadLog === "function") {
      try {
        window.DomeNative.downloadLog(filename, htmlDocument);
        client.health?.showStatus("SAVING LOG...");
        return;
      } catch (err) {
        logger?.warn?.("Native log download failed, falling back to browser download.", err);
      }
    }

    const blob = new Blob([htmlDocument], { type: "text/html;charset=utf-8" });
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.msSaveOrOpenBlob) {
      nav.msSaveOrOpenBlob(blob, filename);
      return;
    }
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      warnUnsupported();
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    const container = document.body ?? document.documentElement;
    if (!container) {
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
      warnUnsupported();
      return;
    }

    let appended = false;
    try {
      container.appendChild(anchor);
      appended = true;
      anchor.click();
    } finally {
      if (appended) {
        container.removeChild(anchor);
      }
      if (typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  for (const button of saveButtons) {
    button?.addEventListener("click", handler);
  }
}

export function clearClientBuffer(client) {
  client.buffer.innerHTML = "";
  client.resetSdwcNowrapState?.();
  client.resetAnsiRendererState?.();
}

export function shouldConfirmClearBuffer(windowRef = globalThis.window) {
  return (
    typeof windowRef !== "undefined"
    && typeof windowRef.matchMedia === "function"
    && windowRef.matchMedia("(max-width: 767px)").matches
  );
}

export function bindClearBufferControls({ client, button, overlay, confirmButton, cancelButton, windowRef = globalThis.window }) {
  if (!button) {
    return;
  }

  const closeOverlay = () => {
    overlay?.classList.add("hide");
  };

  button.addEventListener("click", () => {
    if (shouldConfirmClearBuffer(windowRef) && overlay) {
      overlay.classList.remove("hide");
      return;
    }
    clearClientBuffer(client);
  });

  cancelButton?.addEventListener("click", closeOverlay);
  confirmButton?.addEventListener("click", () => {
    clearClientBuffer(client);
    closeOverlay();
  });
  overlay?.addEventListener("click", event => {
    if (event.target === overlay) {
      closeOverlay();
    }
  });
}

export function bindToggleOverlayButton({ button, overlay, onOpen, closeOnAnyOverlayClick = false }) {
  if (!button || !overlay) {
    return;
  }

  button.addEventListener("click", event => {
    event.preventDefault();
    overlay.classList.toggle("hide");
    if (!overlay.classList.contains("hide")) {
      onOpen?.();
    }
  });
  overlay.addEventListener("click", event => {
    if (closeOnAnyOverlayClick || event.target === overlay) {
      overlay.classList.add("hide");
    }
  });
}

export function bindCloseButton({ button, overlay }) {
  if (!button || !overlay) {
    return;
  }

  button.addEventListener("click", () => {
    overlay.classList.add("hide");
  });
}

export function bindEscapeOverlayClose({ documentRef, overlays }) {
  documentRef.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    overlays.forEach(overlay => {
      if (overlay && !overlay.classList.contains("hide")) {
        overlay.classList.add("hide");
      }
    });
  });
}

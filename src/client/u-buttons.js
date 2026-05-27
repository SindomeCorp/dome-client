import { dome, logger } from "./b-variables.js";
import { refreshClientOptions } from "./pages/client-options.js";
import { buildLogHtml } from "../shared/log-template.js";

dome.setupButtons = function() {
  const toElement = el => (el && el.nodeType === 1 ? el : el?.[0]);


  dome.reconnectButton = toElement(dome.reconnectButton);
  if (dome.reconnectButton) {
    dome.reconnectButton.addEventListener("click", () => {
      dome.socket?.disconnect?.();
      dome.resetSdwcNowrapState?.();
      dome.resetAnsiRendererState?.();
      dome.socket?.off?.("data", dome.parseSocketData);
      dome.socket = dome.setupSocket();
      dome.socket.on("data", dome.parseSocketData);
    });
  }

  if (dome.saveButton) {
    const saveButtons = dome.saveButton.length !== undefined
      ? dome.saveButton
      : [dome.saveButton];
    const handler = event => {
      event?.preventDefault?.();
      const warnUnsupported = () => logger?.warn?.("Log download is not supported in this environment.");
      const now = new Date();
      const month = (now.getMonth() + 1).toString().padStart(2, "0");
      const day = now.getDate().toString().padStart(2, "0");
      const year = now.getFullYear();
      let hours = now.getHours();
      const ampm = hours >= 12 ? "pm" : "am";
      hours = hours % 12;
      if (hours === 0) {
        hours = 12;
      }
      const minutes = now.getMinutes().toString().padStart(2, "0");
      // Build filename timestamp: MM_DD_YYYY_hmmam/pm
      const timestamp = `${month}_${day}_${year}_${hours}${minutes}${ampm}`;
      if (typeof document === "undefined" || typeof Blob === "undefined") {
        warnUnsupported();
        return;
      }
      const baseName = String(globalThis.gameName || "game")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "")
        .toLowerCase() || "game";
      const filename = `${baseName}.log.${timestamp}.html`;
      const bufferHtml = dome.buffer?.innerHTML ?? "";
      const logExportCss = typeof window !== "undefined" ? (window.__LOG_EXPORT_CSS__ || "") : "";
      const inlineLogCss = dome.preferences?.inlineLogCss !== false;
      const htmlDocument = buildLogHtml(bufferHtml, logExportCss, inlineLogCss);
      if (typeof window !== "undefined" && window.DomeNative && typeof window.DomeNative.downloadLog === "function") {
        try {
          window.DomeNative.downloadLog(filename, htmlDocument);
          if (dome.setFadeText && dome.statusDisplay) {
            dome.setFadeText(dome.statusDisplay, "SAVING LOG...");
          }
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
    for (const btn of saveButtons) {
      btn?.addEventListener("click", handler);
    }
  }

  dome.clearButton = toElement(dome.clearButton);
  if (dome.clearButton) {
    dome.clearButton.addEventListener("click", () => {
      const isSmallScreen = typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(max-width: 767px)").matches;
      if (isSmallScreen) {
        const confirmed = window.confirm("Clear the output buffer?");
        if (!confirmed) {
          return;
        }
      }
      dome.buffer.innerHTML = "";
      dome.resetSdwcNowrapState?.();
      dome.resetAnsiRendererState?.();
    });
  }

  dome.scrollButton = toElement(dome.scrollButton);
  if (dome.scrollButton && dome.onToggleAutoScroll) {
    dome.scrollButton.addEventListener("click", dome.onToggleAutoScroll);
  }

  dome.shortcutsButton = toElement(dome.shortcutsButton);
  dome.shortcutsOverlay = toElement(dome.shortcutsOverlay);
  if (dome.shortcutsButton && dome.shortcutsOverlay) {
    dome.shortcutsButton.addEventListener("click", () => {
      dome.shortcutsOverlay.classList.toggle("hide");
    });
    dome.shortcutsOverlay.addEventListener("click", () => {
      dome.shortcutsOverlay.classList.add("hide");
    });
  }

  dome.clientOptionsButton = toElement(dome.clientOptionsButton);
  dome.clientOptionsOverlay = toElement(dome.clientOptionsOverlay);
  if (dome.clientOptionsButton && dome.clientOptionsOverlay) {
    dome.clientOptionsButton.addEventListener("click", event => {
      event.preventDefault();
      dome.clientOptionsOverlay.classList.toggle("hide");
      if (!dome.clientOptionsOverlay.classList.contains("hide")) {
        refreshClientOptions();
      }
    });
    dome.clientOptionsOverlay.addEventListener("click", event => {
      if (event.target === dome.clientOptionsOverlay) {
        dome.clientOptionsOverlay.classList.add("hide");
      }
    });
  }

  dome.clientOptionsClose = toElement(dome.clientOptionsClose);
  if (dome.clientOptionsClose && dome.clientOptionsOverlay) {
    dome.clientOptionsClose.addEventListener("click", () => {
      dome.clientOptionsOverlay.classList.add("hide");
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (dome.clientOptionsOverlay && !dome.clientOptionsOverlay.classList.contains("hide")) {
        dome.clientOptionsOverlay.classList.add("hide");
      }
      if (dome.shortcutsOverlay && !dome.shortcutsOverlay.classList.contains("hide")) {
        dome.shortcutsOverlay.classList.add("hide");
      }
    }
  });

  dome.attachImage = function(elem, imageId, url) {
    const isVideo = url.toLowerCase().match(/mp4|gifv$/);
    const isYouTube = dome.parseYouTubeID(url);
    let segment = `<br><a href="${url}" target="_blank">`;
    if (isVideo) {
      segment += `<video id="${imageId}" loop muted autoplay class="shown-image" style="max-width: 75%"><source type="video/mp4" src="${url.replace(/gifv$/, "mp4")}"></video>`;
    } else if (isYouTube) {
      const width = Math.min(dome.buffer.clientWidth - 20, 560);
      const height = Math.floor(width * 0.5652);
      segment += `<iframe id="${imageId}" class="shown-image" width="${width}" height="${height}" src="https://www.youtube.com/embed/${isYouTube}" frameborder="0" allowfullscreen></iframe>`;
    } else {
      segment += `<img class="shown-image" id="${imageId}" src="${url}" style="max-width: 75%">`;
    }
    segment += "</a><br>";
    elem.innerHTML = segment;
  };

  dome.toggleImage = function(control, imageId, imageURL) {
    const span = dome.buffer.querySelector(`span#s${imageId}`);
    if (!control || !span) {
      logger.debug(control, span, imageId);
      return;
    } else if (control.classList.contains("icon-chevron-down")) {
      // they want to hide the image
      control.classList.remove("icon-chevron-down");
      control.classList.add("icon-chevron-up");
      span.innerHTML = "";
    } else {
      // they want to show the image
      control.classList.remove("icon-chevron-up");
      control.classList.add("icon-chevron-down");
      dome.attachImage(span, imageId, imageURL);
    }
  };
};

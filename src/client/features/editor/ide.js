import { logger } from "../../core/constants.js";
import { parseCommand } from "../../core/command-utils.js";
import { CLIENT_OPTION_BY_PREFERENCE } from "../../../shared/client-options.js";

const IDE_WINDOW_URL = "/editor/ide/";
const IDE_WINDOW_FEATURES = "width=640,height=480,resizable,scrollbars=yes";

export function setupIdeLauncher({
  client,
  win = globalThis.window,
  getSocket = () => client.socket
} = {}) {
  let ideWindow = client.ideWindow || null;
  let pendingInitialEditor = null;
  let pendingUploadSocket = null;

  const rememberPendingState = (editor) => {
    pendingInitialEditor = editor;
    pendingUploadSocket = getSocket();
  };

  const primeWindowState = (targetWindow) => {
    if (!targetWindow) return;
    const uploadSocket = pendingUploadSocket || getSocket();
    try {
      if (uploadSocket) {
        targetWindow.uploadSocket = uploadSocket;
      }
    } catch {}
    try {
      if (pendingInitialEditor) {
        targetWindow.initialEditor = pendingInitialEditor;
      }
    } catch {}
  };

  client.openIDE = (editor) => {
    const uploadCommand = editor?.uploadCommand || "";
    const { command, commandTarget } = parseCommand(uploadCommand);
    logger.info("IDE editor invoked", editor?.contextScratch ? { contextScratch: true } : { ...editor, uploadCommand, command, commandTarget });

    let existing = ideWindow && !ideWindow.closed ? ideWindow : null;
    if (!existing) {
      try {
        existing = win.open("", "dome-ide", IDE_WINDOW_FEATURES);
      } catch {
        existing = null;
      }
    }

    let reuse = false;
    let blankHandle = false;
    try {
      if (existing) {
        const { location } = existing;
        const pathname = typeof location?.pathname === "string" ? location.pathname : "";
        const href = typeof location?.href === "string" ? location.href : "";
        if (pathname === IDE_WINDOW_URL) {
          reuse = true;
          ideWindow = existing;
          ideWindow.uploadSocket = getSocket();
          pendingInitialEditor = null;
          pendingUploadSocket = null;
          ideWindow.postMessage({ type: "ide-open-tab", editor }, "*");
          ideWindow.focus();
          client.ideWindow = ideWindow;
        } else if (!href || href === "about:blank" || pathname === "" || pathname === "blank") {
          blankHandle = true;
        }
      }
    } catch {
      // Ignore cross-origin access errors and proceed to open a new window.
    }

    if (!reuse) {
      rememberPendingState(editor);
      const theme = client.preferences?.edittheme;
      const editorUrl = theme && theme !== CLIENT_OPTION_BY_PREFERENCE.edittheme.def
        ? `${IDE_WINDOW_URL}?et=${encodeURIComponent(theme)}` : IDE_WINDOW_URL;

      if (!blankHandle) {
        try { existing && existing.close(); } catch {}
      }

      let opened;
      try {
        opened = win.open(editorUrl, "dome-ide", IDE_WINDOW_FEATURES);
      } catch {
        opened = null;
      }

      if (!opened && blankHandle && existing) {
        try {
          existing.location.href = editorUrl;
          opened = existing;
        } catch {
          opened = existing;
        }
      }

      ideWindow = opened || null;
      primeWindowState(ideWindow);
      client.ideWindow = ideWindow;
    }
    if (!ideWindow) throw new Error("The browser blocked the IDE. Allow pop-ups and try again.");
  };

  win.addEventListener("message", (event) => {
    if (event.data?.type === "ide-scratch-unavailable" && event.source === ideWindow && event.origin === win.location.origin) {
      client.health?.showStatus("Scratchpad is disabled by this client's existing IDE settings.");
      return;
    }
    if (!(event.data && event.data.type === "ide-ready" && event.source === ideWindow)) {
      return;
    }
    try {
      if (!ideWindow.uploadSocket && (pendingUploadSocket || getSocket())) {
        ideWindow.uploadSocket = pendingUploadSocket || getSocket();
      }
    } catch {}
    if (!ideWindow.initialEditor && pendingInitialEditor) {
      try {
        ideWindow.initialEditor = pendingInitialEditor;
      } catch {}
    }
    if (ideWindow.initialEditor) {
      ideWindow.postMessage({ type: "ide-open-tab", editor: ideWindow.initialEditor }, "*");
      delete ideWindow.initialEditor;
    }
    pendingInitialEditor = null;
    pendingUploadSocket = null;
    ideWindow.addEventListener("unload", () => {
      ideWindow = null;
      client.ideWindow = null;
      pendingInitialEditor = null;
      pendingUploadSocket = null;
    }, { once: true });
  });
}

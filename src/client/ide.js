import { dome, socket, logger } from "./b-variables.js";
import { parseCommand } from "./command-utils.js";

let ideWindow = null;
let pendingInitialEditor = null;
let pendingUploadSocket = null;
dome.ideWindow = null;

const IDE_WINDOW_URL = "/editor/ide/";
const IDE_WINDOW_FEATURES = "width=640,height=480,resizable,scrollbars=yes";

const rememberPendingState = (editor) => {
  pendingInitialEditor = editor;
  pendingUploadSocket = socket;
};

const primeWindowState = (win) => {
  if (!win) return;
  try {
    if (pendingUploadSocket || socket) {
      win.uploadSocket = pendingUploadSocket || socket;
    }
  } catch {}
  try {
    if (pendingInitialEditor) {
      win.initialEditor = pendingInitialEditor;
    }
  } catch {}
};

function openIDE(editor) {
  const uploadCommand = editor?.uploadCommand || "";
  const { command, commandTarget } = parseCommand(uploadCommand);
  logger.info("IDE editor invoked", { ...editor, uploadCommand, command, commandTarget });

  let existing = ideWindow && !ideWindow.closed ? ideWindow : null;
  if (!existing) {
    try {
      existing = window.open("", "dome-ide", IDE_WINDOW_FEATURES);
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
        ideWindow.uploadSocket = socket;
        pendingInitialEditor = null;
        pendingUploadSocket = null;
        ideWindow.postMessage({ type: "ide-open-tab", editor }, "*");
        ideWindow.focus();
        dome.ideWindow = ideWindow;
      } else if (!href || href === "about:blank" || pathname === "" || pathname === "blank") {
        blankHandle = true;
      }
    }
  } catch {
    // Ignore cross-origin access errors and proceed to open a new window.
  }

  if (!reuse) {
    rememberPendingState(editor);

    if (!blankHandle) {
      try { existing && existing.close(); } catch {}
    }

    let opened = null;
    try {
      opened = window.open(IDE_WINDOW_URL, "dome-ide", IDE_WINDOW_FEATURES);
    } catch {
      opened = null;
    }

    if (!opened && blankHandle && existing) {
      try {
        existing.location.href = IDE_WINDOW_URL;
        opened = existing;
      } catch {
        opened = existing;
      }
    }

    ideWindow = opened || null;
    primeWindowState(ideWindow);
    dome.ideWindow = ideWindow;
  }
}

window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ide-ready" && event.source === ideWindow) {
    try {
      if (!ideWindow.uploadSocket && (pendingUploadSocket || socket)) {
        ideWindow.uploadSocket = pendingUploadSocket || socket;
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
      dome.ideWindow = null;
      pendingInitialEditor = null;
      pendingUploadSocket = null;
    }, { once: true });
  }
});

dome.openIDE = openIDE;

const DEFAULT_LOCAL_SAVE_NODE_MAX_LINES = 200;
const DEFAULT_LOCAL_SAVE_NODE_ADMIN_MAX_LINES = 800;
const DEFAULT_LOCAL_SAVE_NOTE_MAX_LINES = 20;

export function useIdeConfig() {
  const rootEl = getRootElement();
  return {
    editorTheme: rootEl?.getAttribute("data-editor-theme") || "twilight",
    localSaveNodeMaxLines:
      Number(rootEl?.getAttribute("data-local-save-node-max-lines")) ||
      DEFAULT_LOCAL_SAVE_NODE_MAX_LINES,
    localSaveNodeAdminMaxLines:
      Number(rootEl?.getAttribute("data-local-save-node-admin-max-lines")) ||
      DEFAULT_LOCAL_SAVE_NODE_ADMIN_MAX_LINES,
    localSaveNoteMaxLines:
      Number(rootEl?.getAttribute("data-local-save-note-max-lines")) ||
      DEFAULT_LOCAL_SAVE_NOTE_MAX_LINES,
    ideEditOpenParent: rootEl?.getAttribute("data-ide-edit-open-parent") === "true",
    ideVmsNoteEnabled: rootEl?.getAttribute("data-ide-vms-note-enabled") === "true",
    ideObjectBrowserEnabled: readEnabledAttribute(rootEl, "data-ide-object-browser-enabled"),
    idePropertyBrowserEnabled: readEnabledAttribute(rootEl, "data-ide-property-browser-enabled"),
    ideHoverOverlaysEnabled: readEnabledAttribute(rootEl, "data-ide-hover-overlays-enabled"),
    ideReferenceNavigationEnabled: readEnabledAttribute(rootEl, "data-ide-reference-navigation-enabled"),
    ideScratchEnabled: readEnabledAttribute(rootEl, "data-ide-scratch-enabled"),
    editorParser: rootEl?.getAttribute("data-editor-parser") || ""
  };
}

function readEnabledAttribute(rootEl, attributeName) {
  return rootEl?.getAttribute(attributeName) !== "false";
}

function getRootElement() {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") {
    return null;
  }
  return document.getElementById("root");
}

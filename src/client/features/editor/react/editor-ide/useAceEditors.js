import { useEffect, useRef } from "react";
import ace from "ace-builds/src-noconflict/ace.js";
import "ace-builds/src-noconflict/theme-tomorrow_night_blue.js";
import "../../ace/keybinding-vim.js";
import "../../ace/mode-moo.js";
import "ace-builds/src-noconflict/mode-text.js";
import { getFontFamily } from "../../ace/fonts.js";
import { configureMooEditor } from "../../ace/editor-options.js";
import {
  getDefinitionTargetAtPosition,
  getEditingObjectId,
  resolveThisReference,
  splitReferenceTarget
} from "./targets.js";
import {
  formatOpenReferenceCommand,
  formatPropertyOverlayCommand,
  formatVerbOverlayCommand
} from "./protocol.js";
import { emitInput } from "./socketAdapter.js";

ace?.config?.set?.("basePath", "/js/ace");

export function useAceEditors({
  active,
  editorFont,
  editorTheme,
  ideEditOpenParent,
  ideHoverOverlaysEnabled,
  ideReferenceNavigationEnabled,
  lineLimits,
  onContentChange,
  onHoverOverlay,
  onHoverOverlayClear,
  orientation,
  overlayCache,
  pendingOverlayKey,
  vimMode,
  wordWrap
}) {
  const editors = useRef({});

  useEffect(() => {
    const id = setTimeout(() => editors.current[active]?.resize(), 0);
    return () => clearTimeout(id);
  }, [orientation, active]);

  useEffect(() => {
    const onWinResize = () => {
      requestAnimationFrame(() => editors.current[active]?.resize());
    };
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, [active]);

  useEffect(() => {
    Object.values(editors.current).forEach((ed) => {
      ed.setKeyboardHandler(vimMode ? "ace/keyboard/vim" : "");
    });
  }, [vimMode]);

  useEffect(() => {
    const family = getFontFamily(editorFont);
    Object.values(editors.current).forEach((ed) => {
      ed.setOption("fontFamily", family);
    });
  }, [editorFont]);

  useEffect(() => {
    Object.values(editors.current).forEach((ed) => {
      const session = ed.getSession();
      session.setUseWrapMode(wordWrap);
      ed.setOption("wrap", wordWrap ? "free" : "off");
      ed.renderer.updateFull();
    });
  }, [wordWrap]);

  const setEditorRef = (id, node, content, command, commandTarget = "") => {
    if (!node || editors.current[id]) return;
    if (typeof ace?.edit !== "function") return;

    const ed = ace.edit(node);
    if (!ed || typeof ed.getSession !== "function") return;
    const isProgram = command === "@program";
    const editingObjectId = getEditingObjectId(command, commandTarget);
    const lineLimit = getLineLimit(command, lineLimits);

    if (editorTheme) ed.setTheme(`ace/theme/${editorTheme}`);
    if (isProgram) {
      configureMooEditor(ed);
    } else {
      ed.getSession().setMode("ace/mode/text");
    }
    if (vimMode) ed.setKeyboardHandler("ace/keyboard/vim");
    ed.setOption("fontFamily", getFontFamily(editorFont));
    ed.setOption("printMarginColumn", 120);
    const session = ed.getSession();
    session.setUseWrapMode(wordWrap);
    ed.setOption("wrap", wordWrap ? "free" : "off");
    ed.renderer.updateFull();
    ed.setValue(content, -1);
    ed.on("change", () => {
      if (lineLimit) {
        const currentSession = ed.getSession();
        const lineCount = currentSession.getLength();
        if (lineCount > lineLimit) {
          const cursor = ed.getCursorPosition();
          ed.undo();
          ed.moveCursorTo(
            Math.min(cursor.row, lineLimit - 1),
            cursor.column
          );
          ed.clearSelection();
          return;
        }
      }
      onContentChange(id, ed.getValue());
    });
    ed.on("click", (event) => {
      if (!isProgram) return;
      if (!ideReferenceNavigationEnabled) return;
      const domEvent = event?.domEvent;
      if (!domEvent || !(domEvent.metaKey || domEvent.ctrlKey)) return;
      const pos = event?.getDocumentPosition?.();
      if (!pos) return;
      const line = ed.getSession()?.getLine?.(pos.row) || "";
      const target = resolveThisReference(getDefinitionTargetAtPosition(line, pos.column), editingObjectId);
      if (!target) return;
      domEvent.preventDefault?.();
      domEvent.stopPropagation?.();
      const editCommand = formatOpenReferenceCommand(target, { openParent: ideEditOpenParent });
      if (editCommand) emitInput(editCommand);
    });
    ed.on("mousemove", (event) => {
      if (!ideHoverOverlaysEnabled) return;
      const pos = event?.getDocumentPosition?.();
      const domEvent = event?.domEvent;
      if (!pos || !domEvent) return;
      const line = ed.getSession()?.getLine?.(pos.row) || "";
      const target = resolveThisReference(getDefinitionTargetAtPosition(line, pos.column), editingObjectId);
      const parsed = splitReferenceTarget(target);
      if (!parsed) {
        onHoverOverlayClear(id);
        pendingOverlayKey.current = "";
        return;
      }
      const key = `${parsed.objectId}::${parsed.itemName}`;
      const cached = overlayCache.current[parsed.kind].get(key);
      onHoverOverlay({
        tabId: id,
        kind: parsed.kind,
        objectId: parsed.objectId,
        itemName: parsed.itemName,
        x: (domEvent.clientX || 0) + 12,
        y: (domEvent.clientY || 0) + 12,
        loading: !cached,
        payload: cached || null
      });
      if (cached) return;
      if (pendingOverlayKey.current === `${parsed.kind}:${key}`) return;
      pendingOverlayKey.current = `${parsed.kind}:${key}`;
      const overlayCommand = parsed.kind === "verb"
        ? formatVerbOverlayCommand(parsed.objectId, parsed.itemName)
        : formatPropertyOverlayCommand(parsed.objectId, parsed.itemName);
      emitInput(overlayCommand);
    });
    ed.on("mouseout", () => {
      onHoverOverlayClear(id);
      pendingOverlayKey.current = "";
    });
    editors.current[id] = ed;
  };

  const destroyEditor = (id) => {
    editors.current[id]?.destroy();
    delete editors.current[id];
  };

  const getEditorValue = (id) => editors.current[id]?.getValue();

  const resizeActiveEditor = () => {
    setTimeout(() => editors.current[active]?.resize(), 0);
  };

  return {
    destroyEditor,
    editors,
    getEditorValue,
    resizeActiveEditor,
    setEditorRef
  };
}

function getLineLimit(command, lineLimits) {
  if (command === "@local-save-node") return lineLimits.localSaveNodeMaxLines;
  if (command === "@local-save-node-admin") return lineLimits.localSaveNodeAdminMaxLines;
  if (command === "@local-save-note") return lineLimits.localSaveNoteMaxLines;
  return null;
}

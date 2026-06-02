import React, { useState, useEffect, useMemo, useRef } from "react";
import { parseCommand, getCommandLabel } from "../command-utils.js";
import { getPreferredFont } from "../ace/fonts.js";
import {
  PROPERTY_EDIT_COMMANDS,
  parseObjectPropertyTarget
} from "./editor-ide/targets.js";
import {
  formatEditPropertyCommand,
  formatEditVerbCommand,
  formatPropertyListCommand,
  formatVerbListCommand,
  getSaveMessages
} from "./editor-ide/protocol.js";
import {
  getOverlayCacheKeys,
  normalizeObjectPropertiesPayload,
  normalizeObjectVerbsPayload,
  sortByLabel,
  sortByPropertyLabel
} from "./editor-ide/payloads.js";
import {
  buildTitle,
  buildIdeTabs,
  createEditableTab,
  OBJECT_BROWSER_TAB,
  PROPERTY_BROWSER_TAB
} from "./editor-ide/tabs.js";
import { emitInput } from "./editor-ide/socketAdapter.js";
import { useAceEditors } from "./editor-ide/useAceEditors.js";
import { useIdeConfig } from "./editor-ide/useIdeConfig.js";
import { useIdeMessages } from "./editor-ide/useIdeMessages.js";
import { usePersistentPreference } from "./editor-ide/usePersistentPreference.js";
import { EditorPane } from "./editor-ide/EditorPane.jsx";
import { EditorToolbar } from "./editor-ide/EditorToolbar.jsx";
import { HoverOverlay } from "./editor-ide/HoverOverlay.jsx";
import { ShortcutDialog } from "./editor-ide/ShortcutDialog.jsx";
import { TabStrip } from "./editor-ide/TabStrip.jsx";
import { VmsPromptDialog } from "./editor-ide/VmsPromptDialog.jsx";

const EMPTY_VMS_PROMPT_STATE = { open: false, tabId: null, value: "" };

export default function EditorIDE() {
  const {
    editorTheme,
    ideEditOpenParent,
    ideVmsNoteEnabled,
    localSaveNodeAdminMaxLines,
    localSaveNodeMaxLines,
    localSaveNoteMaxLines
  } = useIdeConfig();

  const [documents, setDocuments] = useState([]);
  const [panels, setPanels] = useState({ objectBrowser: false, propertyBrowser: false });
  const [objectGraph, setObjectGraph] = useState({});
  const [collapsedObjects, setCollapsedObjects] = useState({});
  const [propertyGraph, setPropertyGraph] = useState({});
  const [collapsedProperties, setCollapsedProperties] = useState({});
  const [propertyObjectMeta, setPropertyObjectMeta] = useState({});
  const [active, setActive] = useState(null);
  const [darkMode, setDarkMode] = usePersistentPreference(
    "ide-dark",
    false,
    (value) => value === "true"
  );
  const [orientation, setOrientation] = usePersistentPreference("ide-orientation", "top");
  const [vimMode, setVimMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [vmsPrompt, setVmsPrompt] = useState(EMPTY_VMS_PROMPT_STATE);
  const [editorFont, setEditorFont] = useState(getPreferredFont());
  const [wordWrap, setWordWrap] = useState(false);
  const [hoverOverlay, setHoverOverlay] = useState(null);
  const recentTabIds = useRef([]);
  const overlayCache = useRef({ verb: new Map(), prop: new Map() });
  const pendingOverlayKey = useRef("");
  const vmsPromptInputRef = useRef(null);
  const tabs = useMemo(() => buildIdeTabs(documents, panels), [documents, panels]);
  const {
    destroyEditor,
    getEditorValue,
    resizeActiveEditor,
    setEditorRef
  } = useAceEditors({
    active,
    editorFont,
    editorTheme,
    ideEditOpenParent,
    lineLimits: {
      localSaveNodeAdminMaxLines,
      localSaveNodeMaxLines,
      localSaveNoteMaxLines
    },
    onContentChange: (id, val) => {
      setDocuments((items) =>
        items.map((item) =>
          item.id === id ? { ...item, content: val, dirty: val !== item.savedContent } : item
        )
      );
    },
    onHoverOverlay: setHoverOverlay,
    onHoverOverlayClear: (id) => {
      setHoverOverlay((state) => (state && state.tabId === id ? null : state));
    },
    orientation,
    overlayCache,
    pendingOverlayKey,
    vimMode,
    wordWrap
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    return () => document.documentElement.classList.remove("dark");
  }, [darkMode]);

  useEffect(() => {
    document.body.classList.add("ide-editor");
    return () => document.body.classList.remove("ide-editor");
  }, []);

  useEffect(() => {
    if (!active) return;
    recentTabIds.current = [...recentTabIds.current.filter((id) => id !== active), active];
  }, [active]);


  const upsertObjectVerb = (objectId, verbLabel) => {
    setObjectGraph((prev) => {
      const current = prev[objectId] || [];
      if (current.some((entry) => entry.verbName === verbLabel)) return prev;
      if (!Object.prototype.hasOwnProperty.call(prev, objectId)) {
        setCollapsedObjects((state) =>
          Object.prototype.hasOwnProperty.call(state, objectId)
            ? state
            : { ...state, [objectId]: true }
        );
      }
      return {
        ...prev,
        [objectId]: sortByLabel([
          ...current,
          { verbName: verbLabel, permissions: "", argumentsText: "" }
        ])
      };
    });
  };

  const replaceObjectVerbs = (objectId, verbRows) => {
    const dedupedMap = new Map();
    verbRows.forEach((row) => {
      if (!row.verbName) return;
      dedupedMap.set(row.verbName, row);
    });
    const deduped = Array.from(dedupedMap.values());
    setCollapsedObjects((state) =>
      Object.prototype.hasOwnProperty.call(state, objectId)
        ? state
        : { ...state, [objectId]: true }
    );
    setObjectGraph((prev) => ({ ...prev, [objectId]: sortByLabel(deduped) }));
  };

  const upsertObjectProperty = (objectId, propertyLabel) => {
    setPropertyGraph((prev) => {
      const current = prev[objectId] || [];
      if (current.some((entry) => entry.propertyName === propertyLabel)) return prev;
      if (!Object.prototype.hasOwnProperty.call(prev, objectId)) {
        setCollapsedProperties((state) =>
          Object.prototype.hasOwnProperty.call(state, objectId)
            ? state
            : { ...state, [objectId]: true }
        );
      }
      return {
        ...prev,
        [objectId]: sortByPropertyLabel([
          ...current,
          { propertyName: propertyLabel, clear: false }
        ])
      };
    });
  };

  const replaceObjectProperties = (objectId, propertyRows, objectMeta) => {
    const dedupedMap = new Map();
    propertyRows.forEach((row) => {
      if (!row.propertyName) return;
      dedupedMap.set(row.propertyName, row);
    });
    const deduped = Array.from(dedupedMap.values());
    setCollapsedProperties((state) =>
      Object.prototype.hasOwnProperty.call(state, objectId)
        ? state
        : { ...state, [objectId]: true }
    );
    setPropertyGraph((prev) => ({ ...prev, [objectId]: sortByPropertyLabel(deduped) }));
    if (objectMeta && typeof objectMeta === "object") {
      setPropertyObjectMeta((prev) => ({ ...prev, [objectId]: objectMeta }));
    }
  };

  const applyObjectVerbsPayload = (payload) => {
    const normalized = normalizeObjectVerbsPayload(payload);
    if (!normalized) return;
    replaceObjectVerbs(normalized.objectId, normalized.rows);
  };

  const applyObjectPropsPayload = (payload) => {
    const normalized = normalizeObjectPropertiesPayload(payload);
    if (!normalized) return;
    replaceObjectProperties(normalized.objectId, normalized.rows, normalized.objectMeta);
  };

  const addTab = (editor) => {
    setHoverOverlay(null);
    pendingOverlayKey.current = "";
    const title = buildTitle(editor);
    const { command, commandTarget } = parseCommand(editor.uploadCommand || "");
    const name = editor.name || `${editor.editorName || ""}|${commandTarget || ""}`;
    const isProgramCommand = command === "@program";
    const isEditVerbTarget = command === "@edit" && commandTarget.includes(":");
    const isEditPropTarget = command === "@edit" && commandTarget.includes(".") && !commandTarget.includes(":");
    const isVerbContext = isProgramCommand || isEditVerbTarget;
    const isPropertyContext = PROPERTY_EDIT_COMMANDS.has(command) || isEditPropTarget;

    if (isVerbContext) {
      const splitAt = commandTarget.indexOf(":");
      if (splitAt > 0 && splitAt < commandTarget.length - 1) {
        const objectId = commandTarget.slice(0, splitAt).trim();
        const verbName = commandTarget.slice(splitAt + 1).trim();
        if (objectId && verbName) {
          upsertObjectVerb(objectId, verbName);
        }
      }
    } else if (isPropertyContext) {
      const parsedTarget = parseObjectPropertyTarget(commandTarget);
      if (parsedTarget) {
        upsertObjectProperty(parsedTarget.objectId, parsedTarget.propertyName);
      }
    }

    setDocuments((prev) => {
      const existing = prev.find((t) => t.name === name);
      if (existing) {
        setActive(existing.id);
        emitInput(
          "@@editor-message There was already a tab with that information open so we have switched the view to that. We did not update the contents."
        );
        return prev;
      }
      const id = Date.now() + Math.random();
      setActive(id);
      const nextTab = createEditableTab({ id, editor, title, command, commandTarget, name, isProgramCommand });
      return [...prev, nextTab];
    });
    if (isVerbContext || isPropertyContext) {
      setPanels((prev) => ({
        objectBrowser: prev.objectBrowser || isVerbContext,
        propertyBrowser: prev.propertyBrowser || isPropertyContext
      }));
    }
  };

  const addScratch = () => {
    const title = "Temporary Scratch Pad";
    addTab({
      editorName: title,
      name: `${title} ${Date.now()}`,
      uploadCommand: `@scratch ${title}`,
    });
  };

  const viewSavedScratch = () => {
    emitInput("@edit me.scratch");
  };

  const handleVerbOverlayPayload = (data) => {
    const objectId = String(data.objectId || "").trim();
    const itemName = String(data.verbName || "").trim();
    if (!objectId || !itemName) return;
    const keys = getOverlayCacheKeys(objectId, itemName, data.payload);
    keys.forEach((key) => overlayCache.current.verb.set(key, data.payload ?? {}));
    setHoverOverlay((state) =>
      state && state.kind === "verb" && state.objectId === objectId && state.itemName === itemName
        ? { ...state, loading: false, payload: data.payload ?? {} }
        : state
    );
  };

  const handlePropOverlayPayload = (data) => {
    const objectId = String(data.objectId || "").trim();
    const itemName = String(data.propertyName || "").trim();
    if (!objectId || !itemName) return;
    const keys = getOverlayCacheKeys(objectId, itemName, data.payload);
    keys.forEach((key) => overlayCache.current.prop.set(key, data.payload ?? {}));
    setHoverOverlay((state) =>
      state && state.kind === "prop" && state.objectId === objectId && state.itemName === itemName
        ? { ...state, loading: false, payload: data.payload ?? {} }
        : state
    );
  };

  useIdeMessages({
    addTab,
    applyObjectPropsPayload,
    applyObjectVerbsPayload,
    handlePropOverlayPayload,
    handleVerbOverlayPayload,
    setEditorFont
  });

  useEffect(() => {
    const handler = (e) => {
      if (tabs.some((t) => t.dirty)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [tabs]);

  const toggleWordWrap = () => {
    setWordWrap((w) => !w);
  };

  useEffect(() => {
    document.title = `Dome-Client Developer IDE [${tabs.length}]`;
  }, [tabs.length]);

  const onSave = () => {
    const tab = tabs.find((t) => t.id === active);
    if (!tab || !tab.commandTarget || tab.commandTarget === "none") return;
    if (ideVmsNoteEnabled && tab.command === "@program" && String(tab.vmsNote || "").trim() === "") {
      setVmsPrompt({ open: true, tabId: tab.id, value: tab.vmsNote || "" });
      return;
    }
    const shouldSendVmsLine = ideVmsNoteEnabled && tab.command === "@program";
    const vmsNote = shouldSendVmsLine ? String(tab.vmsNote || "") : "";
    const didSave = runSave(tab, shouldSendVmsLine ? vmsNote : null);
    if (didSave && ideVmsNoteEnabled && vmsPrompt.open) {
      setVmsPrompt(EMPTY_VMS_PROMPT_STATE);
    }
  };

  const runSave = (tab, vmsNoteLine = null) => {
    const val = getEditorValue(tab.id);
    if (typeof val !== "string") return false;
    const messages = getSaveMessages(tab, val, vmsNoteLine);
    if (!messages.every((message) => emitInput(message))) return false;
    setDocuments((items) => items.map((item) => (item.id === tab.id ? { ...item, savedContent: val, dirty: false } : item)));
    return true;
  };

  const cancelVmsPrompt = () => {
    setVmsPrompt(EMPTY_VMS_PROMPT_STATE);
  };

  const submitVmsPrompt = () => {
    if (!vmsPrompt.open || vmsPrompt.tabId == null) return;
    const targetTab = tabs.find((t) => t.id === vmsPrompt.tabId);
    if (!targetTab) {
      setVmsPrompt(EMPTY_VMS_PROMPT_STATE);
      return;
    }
    const nextNote = vmsPrompt.value || "";
    const didSave = runSave({ ...targetTab, vmsNote: nextNote }, nextNote);
    if (!didSave) return;
    setDocuments((items) => items.map((item) => (item.id === targetTab.id ? { ...item, vmsNote: nextNote } : item)));
    setVmsPrompt(EMPTY_VMS_PROMPT_STATE);
  };

  const onLoadVerbs = (objectId) => {
    setCollapsedObjects((prev) => ({ ...prev, [objectId]: false }));
    emitInput(formatVerbListCommand(objectId));
  };

  const onLoadProps = (objectId) => {
    setCollapsedProperties((prev) => ({ ...prev, [objectId]: false }));
    emitInput(formatPropertyListCommand(objectId));
  };

  const onEditVerb = (objectId, rawVerbName) => {
    const command = formatEditVerbCommand(objectId, rawVerbName);
    if (!command) return;
    emitInput(command);
  };

  const onEditProperty = (objectId, rawPropertyName) => {
    const command = formatEditPropertyCommand(objectId, rawPropertyName);
    if (!command) return;
    emitInput(command);
  };

  const toggleObjectCollapsed = (objectId) => {
    setCollapsedObjects((prev) => ({ ...prev, [objectId]: !prev[objectId] }));
  };

  const togglePropertyCollapsed = (objectId) => {
    setCollapsedProperties((prev) => ({ ...prev, [objectId]: !prev[objectId] }));
  };

  const closeTab = (id) => {
    const isPanel = id === OBJECT_BROWSER_TAB.id || id === PROPERTY_BROWSER_TAB.id;
    if (!isPanel) {
      destroyEditor(id);
    }
    if (isPanel) {
      setPanels((currentPanels) => ({
        objectBrowser: id === OBJECT_BROWSER_TAB.id ? false : currentPanels.objectBrowser,
        propertyBrowser: id === PROPERTY_BROWSER_TAB.id ? false : currentPanels.propertyBrowser
      }));
    } else {
      setDocuments((items) => items.filter((item) => item.id !== id));
    }
    const next = tabs.filter((t) => t.id !== id);
    recentTabIds.current = recentTabIds.current.filter((tabId) => tabId !== id);
    if (active === id) {
      const fallbackId = [...recentTabIds.current].reverse().find((tabId) => next.some((t) => t.id === tabId));
      setActive(fallbackId || next[0]?.id || null);
    }
    if (next.length === 0) {
      setTimeout(() => window.close(), 0);
    }
  };

  const onClose = (id) => {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    if (!t.dirty || window.confirm("Tab has unsaved changes. Close anyway?")) {
      closeTab(id);
    }
  };

  useEffect(() => {
    if (active == null) return;
    if (tabs.some((tab) => tab.id === active)) return;
    const fallbackId = [...recentTabIds.current].reverse().find((tabId) => tabs.some((tab) => tab.id === tabId));
    setActive(fallbackId || tabs[0]?.id || null);
  }, [active, tabs]);

  useEffect(() => {
    if (!ideVmsNoteEnabled) return;
    if (!vmsPrompt.open) return;
    const id = setTimeout(() => vmsPromptInputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [ideVmsNoteEnabled, vmsPrompt.open]);

  useEffect(() => {
    const handler = (e) => {
      if (ideVmsNoteEnabled && vmsPrompt.open) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelVmsPrompt();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          submitVmsPrompt();
          return;
        }
      }

      if (e.key === "Escape" && showShortcuts) {
        setShowShortcuts(false);
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "/") {
        const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
        if ((isMac && e.metaKey) || (!isMac && e.ctrlKey)) {
          e.preventDefault();
          setShowShortcuts((s) => !s);
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey)) return;

      if (key === "s") {
        e.preventDefault();
        const t = tabs.find((tab) => tab.id === active);
        if (t?.commandTarget && t.commandTarget !== "none") {
          onSave();
        }
      } else if (key === "e" && !e.shiftKey) {
        e.preventDefault();
        if (active !== null) {
          onClose(active);
        } else {
          window.close();
        }
      } else if (key === "1") {
        e.preventDefault();
        setVimMode(true);
      } else if (key === "0") {
        e.preventDefault();
        setVimMode(false);
      } else if (key === "[") {
        e.preventDefault();
        if (tabs.length) {
          const idx = tabs.findIndex((t) => t.id === active);
          const next = tabs[(idx - 1 + tabs.length) % tabs.length];
          setActive(next.id);
        }
      } else if (key === "]") {
        e.preventDefault();
        if (tabs.length) {
          const idx = tabs.findIndex((t) => t.id === active);
          const next = tabs[(idx + 1) % tabs.length];
          setActive(next.id);
        }
      } else if (key === "l" && e.shiftKey) {
        e.preventDefault();
        toggleWordWrap();
      } else if (key === "x" && e.shiftKey) {
        e.preventDefault();
        setOrientationPersist(orientation === "top" ? "left" : "top");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onSave, onClose, tabs, showShortcuts, orientation, toggleWordWrap, ideVmsNoteEnabled, vmsPrompt]);

  const toggleTheme = () => {
    setDarkMode((currentValue) => !currentValue);
  };

  const setOrientationPersist = (o) => {
    setOrientation(o);
    resizeActiveEditor();
  };

  const activeTab = tabs.find((t) => t.id === active);
  const inputLabel = getCommandLabel(activeTab?.uploadCommand, activeTab?.editorName);
  const browserTabTitleByType = {
    "object-browser": "Object Browser",
    "property-browser": "Property Browser"
  };
  const isBrowserActive = Object.prototype.hasOwnProperty.call(browserTabTitleByType, activeTab?.tabType || "");
  const editingLabel = isBrowserActive
    ? browserTabTitleByType[activeTab.tabType]
    : `${vimMode ? "VIM Editing" : "Normal Editing"}${inputLabel ? ` | ${inputLabel}` : ""}`;

  return (
    <div className="h-dvh w-dvw bg-bg-canvas text-ink">
      {showShortcuts && <ShortcutDialog onClose={() => setShowShortcuts(false)} />}
      <div className="h-full w-full p-1">
        <div className="h-full w-full mx-auto rounded-xl bg-bg-surface shadow-card border border-line-subtle overflow-hidden flex flex-col">

          <EditorToolbar
            active={active}
            activeTab={activeTab}
            darkMode={darkMode}
            editingLabel={editingLabel}
            isBrowserActive={isBrowserActive}
            onAddScratch={addScratch}
            onClose={onClose}
            onSave={onSave}
            onShowShortcuts={() => setShowShortcuts(true)}
            onToggleTheme={toggleTheme}
            onToggleWordWrap={toggleWordWrap}
            onViewSavedScratch={viewSavedScratch}
            orientation={orientation}
            setOrientation={setOrientationPersist}
            wordWrap={wordWrap}
          />

          {/* Tabs & editors */}
          <div className={`flex-1 flex min-h-0 ${orientation === "left" ? "" : "flex-col"}`}>
            <TabStrip
              active={active}
              onActivate={setActive}
              onClose={onClose}
              orientation={orientation}
              tabs={tabs}
            />

            <div className="flex-1 relative bg-bg-surface">
              {tabs.map((tab) => (
                <EditorPane
                  key={tab.id}
                  active={active}
                  browserProps={{
                    objectBrowser: {
                      collapsedObjects,
                      objectGraph,
                      onEditVerb,
                      onLoadVerbs,
                      onToggleCollapsed: toggleObjectCollapsed
                    },
                    propertyBrowser: {
                      collapsedProperties,
                      onEditProperty,
                      onLoadProps,
                      onToggleCollapsed: togglePropertyCollapsed,
                      propertyGraph,
                      propertyObjectMeta
                    }
                  }}
                  ideVmsNoteEnabled={ideVmsNoteEnabled}
                  onUpdateVmsNote={(tabId, vmsNote) => {
                    setDocuments((items) => items.map((item) => (item.id === tabId ? { ...item, vmsNote } : item)));
                  }}
                  setEditorRef={setEditorRef}
                  tab={tab}
                />
              ))}
            </div>
          </div>

        </div>
      </div>
      <HoverOverlay overlay={hoverOverlay} />
      <VmsPromptDialog
        enabled={ideVmsNoteEnabled}
        inputRef={vmsPromptInputRef}
        onCancel={cancelVmsPrompt}
        onChange={(value) => setVmsPrompt((prev) => ({ ...prev, value }))}
        onSubmit={submitVmsPrompt}
        prompt={vmsPrompt}
      />
    </div>
  );
}

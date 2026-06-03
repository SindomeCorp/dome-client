import React, { useState, useEffect, useMemo, useReducer, useRef } from "react";
import { getPreferredFont } from "../ace/fonts.js";
import {
  normalizeObjectPropertiesPayload,
  normalizeObjectVerbsPayload
} from "./editor-ide/payloads.js";
import {
  buildIdeTabs,
  isBrowserTab,
  OBJECT_BROWSER_TAB,
  PROPERTY_BROWSER_TAB
} from "./editor-ide/tabs.js";
import {
  buildOpenTabPlan
} from "./editor-ide/openTabPlan.js";
import {
  createOverlayPayloadHandler
} from "./editor-ide/overlays.js";
import {
  ideReducer,
  initialIdeState
} from "./editor-ide/state.js";
import { emitInput } from "./editor-ide/socketAdapter.js";
import { useAceEditors } from "./editor-ide/useAceEditors.js";
import { useIdeConfig } from "./editor-ide/useIdeConfig.js";
import { useIdeMessages } from "./editor-ide/useIdeMessages.js";
import { usePersistentPreference } from "./editor-ide/usePersistentPreference.js";
import { useIdeSaveFlow } from "./editor-ide/useIdeSaveFlow.js";
import { useIdeKeyboardShortcuts } from "./editor-ide/useIdeKeyboardShortcuts.js";
import { useIdeBrowserCommands } from "./editor-ide/useIdeBrowserCommands.js";
import { useRecentTabs } from "./editor-ide/useRecentTabs.js";
import {
  buildEditingLabel,
  isBrowserActiveTab
} from "./editor-ide/editorLabels.js";
import { EditorPane } from "./editor-ide/EditorPane.jsx";
import { EditorToolbar } from "./editor-ide/EditorToolbar.jsx";
import { HoverOverlay } from "./editor-ide/HoverOverlay.jsx";
import { ShortcutDialog } from "./editor-ide/ShortcutDialog.jsx";
import { TabStrip } from "./editor-ide/TabStrip.jsx";
import { VmsPromptDialog } from "./editor-ide/VmsPromptDialog.jsx";

export default function EditorIDE() {
  const {
    editorTheme,
    ideEditOpenParent,
    ideHoverOverlaysEnabled,
    ideObjectBrowserEnabled,
    idePropertyBrowserEnabled,
    ideReferenceNavigationEnabled,
    ideScratchEnabled,
    ideVmsNoteEnabled,
    localSaveNodeAdminMaxLines,
    localSaveNodeMaxLines,
    localSaveNoteMaxLines
  } = useIdeConfig();

  const [ideState, dispatchIde] = useReducer(ideReducer, initialIdeState);
  const [darkMode, setDarkMode] = usePersistentPreference(
    "ide-dark",
    false,
    (value) => value === "true"
  );
  const [orientation, setOrientation] = usePersistentPreference("ide-orientation", "top");
  const [vimMode, setVimMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [editorFont, setEditorFont] = useState(getPreferredFont());
  const [wordWrap, setWordWrap] = useState(false);
  const [hoverOverlay, setHoverOverlay] = useState(null);
  const overlayCache = useRef({ verb: new Map(), prop: new Map() });
  const pendingOverlayKey = useRef("");
  const {
    active,
    collapsedObjects,
    collapsedProperties,
    documents,
    objectGraph,
    panels,
    propertyGraph,
    propertyObjectMeta
  } = ideState;
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
    ideHoverOverlaysEnabled,
    ideReferenceNavigationEnabled,
    lineLimits: {
      localSaveNodeAdminMaxLines,
      localSaveNodeMaxLines,
      localSaveNoteMaxLines
    },
    onContentChange: (id, val) => {
      dispatchIde({ type: "markDocumentChanged", id, content: val });
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
  const {
    cancelVmsPrompt,
    onSave,
    setVmsPromptValue,
    submitVmsPrompt,
    vmsPrompt,
    vmsPromptInputRef
  } = useIdeSaveFlow({
    active,
    dispatchIde,
    emitInput,
    getEditorValue,
    ideVmsNoteEnabled,
    tabs
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    return () => document.documentElement.classList.remove("dark");
  }, [darkMode]);

  useEffect(() => {
    document.body.classList.add("ide-editor");
    return () => document.body.classList.remove("ide-editor");
  }, []);

  const activateTab = (id) => {
    dispatchIde({ type: "activateTab", id });
  };

  const applyObjectVerbsPayload = (payload) => {
    const normalized = normalizeObjectVerbsPayload(payload);
    if (!normalized) return;
    dispatchIde({
      type: "replaceObjectVerbs",
      objectId: normalized.objectId,
      rows: normalized.rows
    });
  };

  const applyObjectPropsPayload = (payload) => {
    const normalized = normalizeObjectPropertiesPayload(payload);
    if (!normalized) return;
    dispatchIde({
      type: "replaceObjectProperties",
      objectId: normalized.objectId,
      objectMeta: normalized.objectMeta,
      rows: normalized.rows
    });
  };

  const addTab = (editor) => {
    setHoverOverlay(null);
    pendingOverlayKey.current = "";
    const plan = buildOpenTabPlan(editor, documents);
    if (plan.type === "activateExisting") {
      dispatchIde({ type: "activateTab", id: plan.id });
      emitInput(plan.duplicateMessage);
      return;
    }
    const shouldOpenObjectBrowser = ideObjectBrowserEnabled && plan.objectBrowser;
    const shouldOpenPropertyBrowser = idePropertyBrowserEnabled && plan.propertyBrowser;
    plan.browserEffects
      .filter((effect) =>
        (effect.type === "upsertObjectVerb" && shouldOpenObjectBrowser) ||
        (effect.type === "upsertObjectProperty" && shouldOpenPropertyBrowser)
      )
      .forEach((effect) => dispatchIde(effect));
    dispatchIde({
      type: "openEditableTab",
      objectBrowser: shouldOpenObjectBrowser,
      propertyBrowser: shouldOpenPropertyBrowser,
      tab: plan.tab
    });
  };

  const addScratch = () => {
    if (!ideScratchEnabled) return;
    const title = "Temporary Scratch Pad";
    addTab({
      editorName: title,
      name: `${title} ${Date.now()}`,
      uploadCommand: `@scratch ${title}`,
    });
  };

  const viewSavedScratch = () => {
    if (!ideScratchEnabled) return;
    emitInput("@edit me.scratch");
  };

  const {
    onEditProperty,
    onEditVerb,
    onLoadProps,
    onLoadVerbs,
    toggleObjectCollapsed,
    togglePropertyCollapsed
  } = useIdeBrowserCommands({ dispatchIde, emitInput });

  const handleVerbOverlayPayload = createOverlayPayloadHandler({
    kind: "verb",
    overlayCache,
    setHoverOverlay
  });

  const handlePropOverlayPayload = createOverlayPayloadHandler({
    kind: "prop",
    overlayCache,
    setHoverOverlay
  });

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

  const { getCloseState } = useRecentTabs({ active, dispatchIde, tabs });

  const closeTab = (id) => {
    const isPanel = id === OBJECT_BROWSER_TAB.id || id === PROPERTY_BROWSER_TAB.id;
    if (!isPanel) {
      destroyEditor(id);
    }
    const { nextActiveId, nextTabs } = getCloseState(id);
    dispatchIde({ type: "closeTab", id, nextActiveId });
    if (nextTabs.every(isBrowserTab)) {
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

  const toggleTheme = () => {
    setDarkMode((currentValue) => !currentValue);
  };

  const setOrientationPersist = (o) => {
    setOrientation(o);
    resizeActiveEditor();
  };

  useIdeKeyboardShortcuts({
    active,
    activateTab,
    cancelVmsPrompt,
    onClose,
    onSave,
    orientation,
    setOrientationPersist,
    setShowShortcuts,
    setVimMode,
    showShortcuts,
    submitVmsPrompt,
    tabs,
    toggleWordWrap,
    vmsPrompt
  });

  const activeTab = tabs.find((t) => t.id === active);
  const isBrowserActive = isBrowserActiveTab(activeTab);
  const editingLabel = buildEditingLabel({ activeTab, vimMode });

  return (
    <div className="h-dvh w-dvw bg-bg-canvas text-ink">
      {showShortcuts && (
        <ShortcutDialog
          onClose={() => setShowShortcuts(false)}
          referenceNavigationEnabled={ideReferenceNavigationEnabled}
        />
      )}
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
            showScratchActions={ideScratchEnabled}
            setOrientation={setOrientationPersist}
            wordWrap={wordWrap}
          />

          {/* Tabs & editors */}
          <div className={`flex-1 flex min-h-0 ${orientation === "left" ? "" : "flex-col"}`}>
            <TabStrip
              active={active}
              onActivate={activateTab}
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
                    dispatchIde({ type: "updateVmsNote", id: tabId, vmsNote });
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
        onChange={setVmsPromptValue}
        onSubmit={submitVmsPrompt}
        prompt={vmsPrompt}
      />
    </div>
  );
}

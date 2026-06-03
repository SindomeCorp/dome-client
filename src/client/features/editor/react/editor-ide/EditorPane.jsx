import React, { useState } from "react";
import { ObjectBrowser } from "./ObjectBrowser.jsx";
import { PropertyBrowser } from "./PropertyBrowser.jsx";
import { TAB_TYPES } from "./tabs.js";

export function EditorPane({
  active,
  browserProps,
  ideVmsNoteEnabled,
  onUpdateVmsNote,
  setEditorRef,
  tab
}) {
  return (
    <div className={active === tab.id ? "absolute inset-0" : "hidden"}>
      {tab.tabType === TAB_TYPES.objectBrowser ? (
        <ObjectBrowser {...browserProps.objectBrowser} />
      ) : tab.tabType === TAB_TYPES.propertyBrowser ? (
        <PropertyBrowser {...browserProps.propertyBrowser} />
      ) : (
        <EditableDocument
          ideVmsNoteEnabled={ideVmsNoteEnabled}
          onUpdateVmsNote={onUpdateVmsNote}
          setEditorRef={setEditorRef}
          tab={tab}
        />
      )}
    </div>
  );
}

function EditableDocument({
  ideVmsNoteEnabled,
  onUpdateVmsNote,
  setEditorRef,
  tab
}) {
  const [isVmsNoteFocused, setIsVmsNoteFocused] = useState(false);
  const shouldShowVmsNote = ideVmsNoteEnabled
    && tab.command === "@program"
    && (isVmsNoteFocused || String(tab.vmsNote || "").trim() !== "");

  return (
    <div className="w-full h-full flex flex-col">
      {shouldShowVmsNote && (
        <div className="px-4 pt-4 pb-2 border-b border-line-subtle bg-bg-surface">
          <label className="block text-sm font-medium text-ink-muted mb-1" htmlFor={`vms-note-${tab.id}`}>
            VMS Note
          </label>
          <input
            id={`vms-note-${tab.id}`}
            type="text"
            value={tab.vmsNote || ""}
            onChange={(e) => onUpdateVmsNote(tab.id, e.target.value)}
            onBlur={() => setIsVmsNoteFocused(false)}
            onFocus={() => setIsVmsNoteFocused(true)}
            className="w-full px-3 py-2 rounded-md border border-line-subtle bg-bg-sunken text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            placeholder="Enter VMS note"
            aria-label="VMS note"
          />
        </div>
      )}
      <div
        ref={(node) => setEditorRef(tab.id, node, tab.content, tab.command, tab.commandTarget)}
        className="w-full flex-1"
      />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { getSaveMessages } from "./protocol.js";

const EMPTY_VMS_PROMPT_STATE = { open: false, tabId: null, value: "" };

export function shouldPromptForVmsNote(tab, ideVmsNoteEnabled) {
  return Boolean(
    ideVmsNoteEnabled
      && tab?.command === "@program"
      && String(tab.vmsNote || "").trim() === ""
  );
}

export function saveTab({
  dispatchIde,
  emitInput,
  getEditorValue,
  tab,
  vmsNoteLine = null
}) {
  const val = getEditorValue(tab.id);
  if (typeof val !== "string") return false;
  const messages = getSaveMessages(tab, val, vmsNoteLine);
  if (!messages.every((message) => emitInput(message))) return false;
  dispatchIde({ type: "markDocumentSaved", id: tab.id, content: val });
  return true;
}

export function useIdeSaveFlow({
  active,
  dispatchIde,
  emitInput,
  getEditorValue,
  ideVmsNoteEnabled,
  tabs
}) {
  const [vmsPrompt, setVmsPrompt] = useState(EMPTY_VMS_PROMPT_STATE);
  const vmsPromptInputRef = useRef(null);

  useEffect(() => {
    if (!ideVmsNoteEnabled) return;
    if (!vmsPrompt.open) return;
    const id = setTimeout(() => vmsPromptInputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [ideVmsNoteEnabled, vmsPrompt.open]);

  const runSave = (tab, vmsNoteLine = null) => saveTab({
    dispatchIde,
    emitInput,
    getEditorValue,
    tab,
    vmsNoteLine
  });

  const onSave = () => {
    const tab = tabs.find((t) => t.id === active);
    if (!tab || !tab.commandTarget || tab.commandTarget === "none") return;
    if (shouldPromptForVmsNote(tab, ideVmsNoteEnabled)) {
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
    dispatchIde({ type: "updateVmsNote", id: targetTab.id, vmsNote: nextNote });
    setVmsPrompt(EMPTY_VMS_PROMPT_STATE);
  };

  const setVmsPromptValue = (value) => {
    setVmsPrompt((prev) => ({ ...prev, value }));
  };

  return {
    cancelVmsPrompt,
    onSave,
    setVmsPromptValue,
    submitVmsPrompt,
    vmsPrompt,
    vmsPromptInputRef
  };
}

import { useEffect } from "react";

export function getAdjacentTabId(tabs, active, direction) {
  if (!tabs.length) return null;
  const idx = tabs.findIndex((tab) => tab.id === active);
  const next = tabs[(idx + direction + tabs.length) % tabs.length];
  return next?.id ?? null;
}

export function getShortcutCommand(event, {
  isVmsPromptOpen = false,
  platform = "",
  showShortcuts = false
} = {}) {
  if (isVmsPromptOpen) {
    if (event.key === "Escape") return "cancel-vms-prompt";
    if (event.key === "Enter") return "submit-vms-prompt";
  }

  if (event.key === "Escape" && showShortcuts) return "hide-shortcuts";

  const key = event.key.toLowerCase();
  if (key === "/") {
    const isMac = String(platform || "").includes("Mac");
    if ((isMac && event.metaKey) || (!isMac && event.ctrlKey)) {
      return "toggle-shortcuts";
    }
    return "";
  }

  if (!(event.ctrlKey || event.metaKey)) return "";

  if (key === "s") return "save";
  if (key === "e" && !event.shiftKey) return "close";
  if (key === "1") return "enable-vim";
  if (key === "0") return "disable-vim";
  if (key === "[") return "previous-tab";
  if (key === "]") return "next-tab";
  if (key === "l" && event.shiftKey) return "toggle-word-wrap";
  if (key === "x" && event.shiftKey) return "toggle-orientation";
  return "";
}

export function useIdeKeyboardShortcuts({
  active,
  activateTab,
  cancelVmsPrompt,
  onClose,
  onSave,
  setOrientationPersist,
  setShowShortcuts,
  setVimMode,
  showShortcuts,
  submitVmsPrompt,
  tabs,
  toggleWordWrap,
  vmsPrompt,
  orientation
}) {
  useEffect(() => {
    const handler = (event) => {
      const command = getShortcutCommand(event, {
        isVmsPromptOpen: vmsPrompt.open,
        platform: typeof navigator !== "undefined" ? navigator.platform : "",
        showShortcuts
      });
      if (!command) return;

      if (command === "cancel-vms-prompt") {
        event.preventDefault();
        cancelVmsPrompt();
      } else if (command === "submit-vms-prompt") {
        event.preventDefault();
        submitVmsPrompt();
      } else if (command === "hide-shortcuts") {
        setShowShortcuts(false);
      } else if (command === "toggle-shortcuts") {
        event.preventDefault();
        setShowShortcuts((currentValue) => !currentValue);
      } else if (command === "save") {
        event.preventDefault();
        const tab = tabs.find((entry) => entry.id === active);
        if (tab?.commandTarget && tab.commandTarget !== "none") {
          onSave();
        }
      } else if (command === "close") {
        event.preventDefault();
        if (active !== null) {
          onClose(active);
        } else {
          window.close();
        }
      } else if (command === "enable-vim") {
        event.preventDefault();
        setVimMode(true);
      } else if (command === "disable-vim") {
        event.preventDefault();
        setVimMode(false);
      } else if (command === "previous-tab") {
        event.preventDefault();
        const nextId = getAdjacentTabId(tabs, active, -1);
        if (nextId !== null) activateTab(nextId);
      } else if (command === "next-tab") {
        event.preventDefault();
        const nextId = getAdjacentTabId(tabs, active, 1);
        if (nextId !== null) activateTab(nextId);
      } else if (command === "toggle-word-wrap") {
        event.preventDefault();
        toggleWordWrap();
      } else if (command === "toggle-orientation") {
        event.preventDefault();
        setOrientationPersist(orientation === "top" ? "left" : "top");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
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
  ]);
}

function showTimedIndicator({
  doc = globalThis.document,
  id,
  message = "Saved",
  resetMessage = "Saved",
  isError = false,
  delayMs = 1800
} = {}) {
  const indicator = doc?.getElementById(id);
  if (!indicator) return;
  indicator.textContent = message;
  indicator.classList.toggle("is-error", isError);
  indicator.classList.remove("hide");
  if (indicator._hideTimer) {
    clearTimeout(indicator._hideTimer);
  }
  indicator._hideTimer = setTimeout(() => {
    indicator.classList.add("hide");
    indicator.classList.remove("is-error");
    indicator.textContent = resetMessage;
  }, delayMs);
  indicator._hideTimer.unref?.();
}

export function showClientOptionsSaved(doc = globalThis.document) {
  const indicator = doc?.getElementById("client-options-save-indicator");
  if (!indicator) return;
  indicator.classList.remove("hide");
  if (indicator._hideTimer) {
    clearTimeout(indicator._hideTimer);
  }
  indicator._hideTimer = setTimeout(() => {
    indicator.classList.add("hide");
  }, 1000);
  indicator._hideTimer.unref?.();
}

export function showImportExportToast(message, isError = false, doc = globalThis.document) {
  showTimedIndicator({
    doc,
    id: "client-options-import-export-indicator",
    message,
    resetMessage: "Saved",
    isError,
    delayMs: 2200
  });
}

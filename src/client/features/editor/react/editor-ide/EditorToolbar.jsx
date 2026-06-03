import React from "react";

export function EditorToolbar({
  active,
  activeTab,
  darkMode,
  editingLabel,
  isBrowserActive,
  onAddScratch,
  onClose,
  onSave,
  onShowShortcuts,
  onToggleTheme,
  onToggleWordWrap,
  onViewSavedScratch,
  orientation,
  setOrientation,
  showScratchActions,
  wordWrap
}) {
  return (
    <div className="px-2 py-2 md:px-4 md:py-3 border-b border-line-subtle bg-bg-surface">
      <div className="flex flex-wrap md:flex-nowrap items-center gap-1 md:gap-2">
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          <div
            className="inline-flex shrink-0 rounded-md overflow-hidden border border-line-subtle bg-bg-sunken"
            role="group"
            aria-label="Tab orientation"
          >
            <button
              onClick={() => setOrientation("top")}
              aria-pressed={orientation === "top"}
              aria-label="Horizontal tabs (top)"
              title="Horizontal tabs (top)"
              className={`px-1 py-0.5 text-[11px] md:px-3 md:py-2 md:text-base ${
                orientation === "top"
                  ? "bg-bg-surface text-ink"
                  : "text-ink-muted hover:text-ink hover:bg-bg-surface"
              }`}
            >
              ☰
            </button>
            <button
              onClick={() => setOrientation("left")}
              aria-pressed={orientation === "left"}
              aria-label="Vertical tabs (left)"
              title="Vertical tabs (left)"
              className={`px-1 py-0.5 text-[11px] md:px-3 md:py-2 md:text-base ${
                orientation === "left"
                  ? "bg-bg-surface text-ink"
                  : "text-ink-muted hover:text-ink hover:bg-bg-surface"
              }`}
            >
              ⋮
            </button>
          </div>

          <button
            onClick={onToggleTheme}
            className="px-1 py-0.5 text-[11px] md:px-3 md:py-2 md:text-base rounded-md border border-line-subtle bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? "☀" : "🌙"}
          </button>

          <button
            onClick={onToggleWordWrap}
            className={`px-1 py-0.5 text-[11px] md:px-3 md:py-2 md:text-base rounded-md border bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
              wordWrap ? "border-brand-500 ring-1 ring-brand-500/40" : "border-line-subtle"
            }`}
            aria-label={wordWrap ? "Disable word wrap" : "Enable word wrap"}
            title={`${wordWrap ? "Disable" : "Enable"} word wrap for all tabs (Ctrl Shift L)`}
          >
            {wordWrap ? "↩" : "→"}
          </button>

          <button
            onClick={onShowShortcuts}
            className="px-1 py-0.5 text-[11px] md:px-3 md:py-2 md:text-base rounded-md border border-line-subtle bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            aria-label="Show editor shortcuts"
            title="Show editor shortcuts (⌘/Ctrl+/)"
          >
            ⌨
          </button>

          {showScratchActions && (
            <>
              <button
                onClick={onAddScratch}
                className="px-1 py-0.5 text-[11px] md:px-4 md:py-2 md:text-base rounded-md border border-line-subtle bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                title="Add temporary scratch pad"
              >
                Add Scratch
              </button>

              <button
                onClick={onViewSavedScratch}
                className="px-1 py-0.5 text-[11px] md:px-4 md:py-2 md:text-base rounded-md border border-line-subtle bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                title="View saved scratch pad"
              >
                View Scratch
              </button>
            </>
          )}
        </div>

        <div className="hidden md:block flex-1 min-w-0 text-center text-lg text-ink-muted truncate">
          {editingLabel}
        </div>

        <div className="ml-auto flex items-center gap-1 md:gap-3">
          {!isBrowserActive && (
            <div className="flex items-center gap-1 md:gap-2 text-[11px] md:text-lg">
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  activeTab?.dirty ? "text-warn-500" : "text-ok-500"
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    activeTab?.dirty ? "bg-warn-500" : "bg-ok-500"
                  }`}
                />
                {activeTab?.dirty ? "Unsaved" : "Saved"}
              </span>
            </div>
          )}

        {activeTab?.commandTarget &&
          activeTab.commandTarget !== "none" && (
          <button
            onClick={onSave}
            className="inline-flex items-center gap-1 md:gap-2 px-1 py-0.5 text-[11px] md:px-4 md:py-2 md:text-base rounded-md bg-brand-600 text-ink-invert hover:bg-brand-500 active:translate-y-[0.5px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            title="Save active tab (⌘/Ctrl+S)"
          >
            <svg className="w-3.5 h-3.5 md:w-5 md:h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 21h14V7l-4-4H5v18Zm3-3h8M9 3v4h6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Save
          </button>
        )}

          <button
            onClick={() => (active !== null ? onClose(active) : window.close())}
            className="inline-flex items-center gap-1 md:gap-2 px-1 py-0.5 text-[11px] md:px-4 md:py-2 md:text-base rounded-md bg-red-600 text-ink-invert hover:bg-red-500 active:translate-y-[0.5px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
            title="Close active tab (⌘/Ctrl+E)"
          >
            <svg className="w-3.5 h-3.5 md:w-5 md:h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M6 18L18 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Close
          </button>
        </div>
      </div>

      <div className="mt-1 text-center text-xs text-ink-muted truncate md:hidden">
        {editingLabel}
      </div>
    </div>
  );
}

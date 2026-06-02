import React from "react";

export function VmsPromptDialog({
  enabled,
  inputRef,
  onCancel,
  onChange,
  onSubmit,
  prompt
}) {
  if (!enabled || !prompt.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="VMS save note prompt"
        className="bg-bg-surface text-ink rounded-lg border border-line-subtle shadow-card p-6 w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-3xl font-semibold mb-2">VMS Save Note</h2>
        <p className="text-lg text-ink-muted mb-4">Add a note for this verb save. Press Enter to submit or Esc to cancel.</p>
        <input
          ref={inputRef}
          type="text"
          value={prompt.value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-line-subtle bg-bg-sunken text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          placeholder="Optional VMS note"
          aria-label="VMS note prompt input"
        />
        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-base rounded-md border border-line-subtle bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-ink-invert hover:bg-brand-500 active:translate-y-[0.5px] transition text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

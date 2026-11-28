import React, { useEffect, useId, useRef } from "react";

export function ShortcutDialog({ onClose, referenceNavigationEnabled = true }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = dialog.ownerDocument.activeElement;
    dialog.showModal?.();
    return () => {
      dialog.close?.();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto max-h-[88vh] w-[min(96vw,56rem)] overflow-auto rounded-lg bg-bg-surface text-ink shadow-card backdrop:bg-ink/50"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="p-3 sm:p-6">
        <header className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
          <h2 id={titleId} className="text-lg font-semibold sm:text-2xl">Editor Shortcuts</h2>
          <button
            type="button"
            className="rounded-md border border-line-subtle bg-bg-sunken px-3 py-1 hover:bg-bg-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500/40"
            onClick={onClose}
          >
            Close shortcuts
          </button>
        </header>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-labelledby={titleId}>
          <table className="w-full min-w-[34rem] text-left border-collapse table-auto whitespace-nowrap">
            <thead>
              <tr className="text-sm sm:text-base text-ink-muted">
                <th className="px-2 sm:px-4 pb-2">Action</th>
                <th className="px-2 sm:px-4 pb-2">macOS</th>
                <th className="px-2 sm:px-4 pb-2">Windows/Linux</th>
              </tr>
            </thead>
            <tbody className="text-sm sm:text-base">
              <tr>
                <td className="py-1 px-2 sm:px-4">Save tab</td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">⌘ S</kbd></td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl S</kbd></td>
              </tr>
              <tr>
                <td className="py-1 px-2 sm:px-4">Close tab</td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">⌘ E</kbd></td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl E</kbd></td>
              </tr>
              <tr>
                <td className="py-1 px-2 sm:px-4">Enable VIM mode</td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">⌘ 1</kbd></td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl 1</kbd></td>
              </tr>
              <tr>
                <td className="py-1 px-2 sm:px-4">Disable VIM mode</td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">⌘ 0</kbd></td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl 0</kbd></td>
              </tr>
              <tr>
                <td className="py-1 px-2 sm:px-4">Previous tab</td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">⌘ [</kbd></td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl [</kbd></td>
              </tr>
              <tr>
                <td className="py-1 px-2 sm:px-4">Next tab</td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">⌘ ]</kbd></td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl ]</kbd></td>
              </tr>
              <tr>
                <td className="py-1 px-2 sm:px-4">Toggle word wrap</td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl Shift L</kbd></td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl Shift L</kbd></td>
              </tr>
              <tr>
                <td className="py-1 px-2 sm:px-4">Toggle tab alignment</td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">⌘ ⇧ X</kbd></td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl Shift X</kbd></td>
              </tr>
              <tr>
                <td className="py-1 px-2 sm:px-4">Toggle shortcuts overlay</td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">⌘ /</kbd></td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl /</kbd></td>
              </tr>
              {referenceNavigationEnabled && (
                <tr>
                  <td className="py-1 px-2 sm:px-4">Edit Verb / Prop</td>
                  <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">⌘ Click ref</kbd></td>
                  <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border border-line-subtle rounded-sm text-sm sm:text-base">Ctrl Click ref</kbd></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </dialog>
  );
}

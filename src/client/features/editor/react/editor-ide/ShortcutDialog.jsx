import React from "react";

export function ShortcutDialog({ onClose, referenceNavigationEnabled = true }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-bg-surface text-ink rounded-lg shadow-card p-3 sm:p-6 w-[min(96vw,56rem)] max-h-[88vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg sm:text-2xl font-semibold mb-3 sm:mb-4">Editor Shortcuts</h2>
        <div className="overflow-x-auto">
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
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">⌘ S</kbd></td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl S</kbd></td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-4">Close tab</td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">⌘ E</kbd></td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl E</kbd></td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-4">Enable VIM mode</td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">⌘ 1</kbd></td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl 1</kbd></td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-4">Disable VIM mode</td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">⌘ 0</kbd></td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl 0</kbd></td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-4">Previous tab</td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">⌘ [</kbd></td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl [</kbd></td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-4">Next tab</td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">⌘ ]</kbd></td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl ]</kbd></td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-4">Toggle word wrap</td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl Shift L</kbd></td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl Shift L</kbd></td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-4">Toggle tab alignment</td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">⌘ ⇧ X</kbd></td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl Shift X</kbd></td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-4">Toggle shortcuts overlay</td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">⌘ /</kbd></td>
              <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl /</kbd></td>
            </tr>
            {referenceNavigationEnabled && (
              <tr>
                <td className="py-1 px-2 sm:px-4">Edit Verb / Prop</td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">⌘ Click ref</kbd></td>
                <td className="py-1 px-2 sm:px-4"><kbd className="px-2 py-1 border rounded text-sm sm:text-base">Ctrl Click ref</kbd></td>
              </tr>
            )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

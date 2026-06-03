import React from "react";
import {
  formatOverlayValue,
  getOverlayDisplayObjectId
} from "./payloads.js";

export function HoverOverlay({ overlay }) {
  if (!overlay) return null;

  return (
    <div
      className="sdwc-hover-overlay fixed z-50 min-w-[90ch] max-w-[110ch] rounded-md border border-line-subtle bg-bg-surface/95 shadow-card p-4 text-lg"
      style={{ left: overlay.x, top: overlay.y }}
    >
      <div className="font-semibold text-ink mb-2">
        {overlay.kind === "verb"
          ? `${getOverlayDisplayObjectId(overlay)}:${overlay.itemName}`
          : `${getOverlayDisplayObjectId(overlay)}.${overlay.itemName}`}
      </div>
      {overlay.loading ? (
        <div className="text-ink-muted">Loading...</div>
      ) : (
        <pre className="text-base text-ink-muted whitespace-pre-wrap break-words max-h-56 overflow-auto m-0">
          {formatOverlayValue(overlay.payload)}
        </pre>
      )}
    </div>
  );
}

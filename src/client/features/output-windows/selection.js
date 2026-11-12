import { recordText } from "./history.js";
import { forEachChunked } from "./work-queue.js";

function endpoint(doc, node, offset) {
  const row = (node.nodeType === 1 ? node : node.parentElement)?.closest("[data-output-id]");
  if (!row) return null;
  const range = doc.createRange();
  range.selectNodeContents(row);
  range.setEnd(node, offset);
  const prefix = range.cloneContents();
  prefix.querySelectorAll("button, [data-preview-for]").forEach((element) => element.remove());
  return { id: Number(row.dataset.outputId), offset: prefix.textContent.length, row };
}

export function readOutputSelection(doc) {
  const selection = doc.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const anchor = endpoint(doc, selection.anchorNode, selection.anchorOffset);
  const focus = endpoint(doc, selection.focusNode, selection.focusOffset);
  if (!anchor || !focus) return null;
  const panel = anchor.row.closest(".output-panel");
  if (!panel || focus.row.closest(".output-panel") !== panel) return null;
  const forward = anchor.id < focus.id || (anchor.id === focus.id && anchor.offset <= focus.offset);
  return { panel: panel.id === "output-main-panel" ? "main" : "secondary", start: forward ? anchor : focus, end: forward ? focus : anchor };
}

export async function copyOutputSelection(snapshot, selection, { scope = () => true, signal } = {}) {
  const parts = [];
  await forEachChunked(snapshot, (record) => {
    if (!scope(record)) return;
    let text = recordText(record).replace(/\[host=([^\]]+)\]/gi, "$1");
    if (record.id === selection.end.id) text = text.slice(0, selection.end.offset);
    if (record.id === selection.start.id) text = text.slice(selection.start.offset);
    parts.push(text);
  }, { signal });
  return parts.join("\n");
}

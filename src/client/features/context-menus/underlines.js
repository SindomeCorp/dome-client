export const CONTEXT_UNDERLINE = "dome-context-targets";

export function supportsContextUnderlines(win) {
  return typeof win.Highlight === "function" && typeof win.CSS?.highlights?.set === "function" && typeof win.CSS?.highlights?.get === "function";
}

export function actionableContextRanges(matches, available) {
  // Partition priority-ordered matches so unavailable winners leave their overlap unmarked.
  const boundaries = [...new Set(matches.flatMap((match) => [match.start, match.end]))].sort((first, second) => first - second);
  const eligible = matches.map(available);
  const ranges = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const winner = matches.findIndex((match) => match.start <= start && match.end >= end);
    if (winner < 0 || !eligible[winner]) continue;
    const previous = ranges.at(-1);
    if (previous?.end === start) previous.end = end;
    else ranges.push({ start, end });
  }
  return ranges;
}

export function createContextUnderlines(win) {
  const doc = win.document;
  const registry = supportsContextUnderlines(win) ? win.CSS.highlights : null;
  const highlight = registry ? registry.get(CONTEXT_UNDERLINE) || new win.Highlight() : null;
  if (highlight) registry.set(CONTEXT_UNDERLINE, highlight);
  const painted = new Map();
  const remove = (row) => {
    for (const range of painted.get(row)?.ranges || []) highlight.delete(range);
    painted.delete(row);
  };
  return {
    update(row, projection, intervals) {
      if (!highlight) return;
      if (!intervals.length) { remove(row); return; }
      const key = JSON.stringify(intervals);
      const nodes = projection.nodes.filter((part) => !part.node.parentElement.closest("a"));
      const previous = painted.get(row);
      if (previous?.key === key && previous.nodes.length === nodes.length && nodes.every((part, index) => previous.nodes[index].node === part.node && previous.nodes[index].length === part.node.length && previous.nodes[index].start === part.start)) return;
      remove(row);
      const ranges = [];
      for (const part of nodes) {
        for (const interval of intervals) {
          const start = Math.max(interval.start, part.start);
          const end = Math.min(interval.end, part.end);
          if (start >= end) continue;
          const range = doc.createRange();
          range.setStart(part.node, start - part.start);
          range.setEnd(part.node, end - part.start);
          highlight.add(range);
          ranges.push(range);
        }
      }
      painted.set(row, { key, ranges, nodes: nodes.map((part) => ({ node: part.node, length: part.node.length, start: part.start })) });
    },
    prune(rows) {
      if (!painted.size) return;
      const mounted = new Set(rows);
      for (const row of painted.keys()) if (!mounted.has(row)) remove(row);
    },
    clear() { for (const row of painted.keys()) remove(row); }
  };
}

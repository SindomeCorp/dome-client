import { recordText } from "./history.js";
import { forEachChunked, yieldToBrowser } from "./work-queue.js";
import { renderRecordHtml } from "./record-renderer.js";
import { buildLogHtml } from "../../../shared/log-template.js";
import { buildLogDownloadFilename } from "../terminal/log-download.js";

export async function searchSnapshot(snapshot, query, { scope = () => true, matchCase = false, signal } = {}) {
  const matches = [];
  if (!query) return matches;
  const literal = new RegExp(query.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&"), matchCase ? "gu" : "giu");
  await forEachChunked(snapshot, (record) => {
    if (!scope(record)) return;
    const text = recordText(record);
    for (const match of text.matchAll(literal)) {
      matches.push({ id: record.id, start: match.index, length: match[0].length });
    }
  }, { signal });
  return matches;
}

export async function copySnapshot(snapshot, { scope = () => true, start = snapshot.first, end = snapshot.last, signal } = {}) {
  const parts = [];
  await forEachChunked(snapshot, (record) => {
    if (record.id >= start && record.id <= end && scope(record)) parts.push(recordText(record));
  }, { signal });
  return parts.join("\n");
}

export async function exportSnapshot(snapshot, { client, css = "", inlineCss = true, signal, progress = () => {} } = {}) {
  const shell = buildLogHtml("", css, inlineCss).replace("</head>",
    "<style>html,body{height:auto!important;overflow:visible!important}#browser-client{height:auto!important;min-height:0!important;overflow:visible!important;display:block!important}#browser-client #lineBuffer{height:auto!important;overflow:visible!important;display:block!important}</style></head>");
  const suffix = "</div></div></body></html>";
  const parts = [shell.slice(0, -suffix.length)];
  let group = null;
  let batch = "";
  let completed = 0;
  await forEachChunked(snapshot, (record) => {
    const nextGroup = client.preferences.sdwcNowrapBlocks ? record.group : null;
    if (nextGroup !== group) {
      if (group) batch += "</div>";
      if (nextGroup) batch += "<div class=\"sdwc-nowrap-block\">";
      group = nextGroup;
    }
    batch += "<div>" + renderRecordHtml(record, { client, exportMode: true }) + "</div>";
    if (++completed % 256 === 0) {
      parts.push(batch);
      batch = "";
      progress(completed, Math.max(0, snapshot.last - snapshot.first + 1));
    }
  }, { signal });
  if (group) batch += "</div>";
  parts.push(batch, suffix);
  progress(completed, Math.max(0, snapshot.last - snapshot.first + 1));
  return parts;
}

export function setupHistoryTools(manager) {
  const { doc, win, client } = manager;
  const form = doc.querySelector("#output-find");
  const query = doc.querySelector("#output-find-query");
  const scope = doc.querySelector("#output-find-scope");
  const matchCase = doc.querySelector("#output-find-case");
  const count = doc.querySelector("#output-find-count");
  const operation = doc.querySelector("#output-operation");
  const operationMessage = doc.querySelector("#output-operation-message");
  let searchController;
  let operationController;
  let matches = [];
  let selected = -1;
  let searchedThrough = 0;
  let searching = false;
  let searchPending = false;
  let debounce;
  let previousFocus;
  const range = { main: null, secondary: null };

  function report(message) { manager.report(message); }
  function updateCount() {
    count.textContent = searching ? "Searching…" : matches.length ? (selected + 1) + " of " + matches.length : query.value ? "No matches" : "";
  }
  function scopePredicate(name = scope.value, state = manager.routeState()) {
    return (record) => name === "all" || manager.panelFor(record, state) === name;
  }
  async function go(delta = 0) {
    if (!matches.length) return;
    selected = ((selected + delta) % matches.length + matches.length) % matches.length;
    const match = matches[selected];
    await manager.whenIndexed();
    const record = manager.history.get(match.id);
    if (record) {
      const panel = manager.panelFor(record);
      for (const [name, view] of Object.entries(manager.views)) {
        if (name !== panel) { view.highlight = null; view.schedule(); }
      }
      manager.activePanel = panel;
      manager.views[panel].jump(match.id, match);
    }
    updateCount();
  }
  async function search({ incremental = false, jump = false } = {}) {
    if (form.classList.contains("hide")) return;
    if (incremental && searching) { searchPending = true; return; }
    searchController?.abort();
    const controller = searchController = new AbortController();
    const current = matches[selected];
    const needle = query.value;
    if (!incremental) {
      for (const view of Object.values(manager.views)) { view.highlight = null; view.schedule(); }
    }
    searching = true;
    updateCount();
    try {
      const snapshot = await manager.snapshot(controller.signal);
      if (controller.signal.aborted) return;
      const iterator = incremental ? {
        *[Symbol.iterator]() { for (const record of snapshot) if (record.id > searchedThrough) yield record; }
      } : snapshot;
      const found = await searchSnapshot(iterator, needle, {
        scope: scopePredicate(), matchCase: matchCase.checked, signal: controller.signal
      });
      if (incremental) matches = matches.filter((match) => match.id >= manager.history.first).concat(found);
      else matches = found;
      searchedThrough = snapshot.last;
      const oldIndex = current ? matches.findIndex((match) => match.id === current.id && match.start === current.start) : -1;
      selected = oldIndex >= 0 ? oldIndex : matches.length ? 0 : -1;
      if (jump && matches.length) await go();
    } catch (error) {
      if (error.name !== "AbortError") report("Output search failed: " + error.message);
    } finally {
      if (searchController === controller) {
        searching = false;
        updateCount();
        if (searchPending) { searchPending = false; search({ incremental: true }); }
      }
    }
  }
  function open() {
    previousFocus = doc.activeElement;
    form.classList.remove("hide");
    query.focus();
    query.select();
    search();
  }
  function close() {
    searchController?.abort();
    matches = [];
    selected = -1;
    searchedThrough = 0;
    searching = false;
    searchPending = false;
    form.classList.add("hide");
    for (const view of Object.values(manager.views)) {
      view.highlight = null;
      view.schedule();
    }
    (previousFocus?.isConnected ? previousFocus : client.inputReader)?.focus();
  }
  doc.querySelector("#button-output-find")?.addEventListener("click", open);
  doc.querySelector("#output-find-close").addEventListener("click", close);
  doc.querySelector("#output-find-previous").addEventListener("click", () => go(-1));
  form.addEventListener("submit", (event) => { event.preventDefault(); go(1); });
  for (const input of [query, scope, matchCase]) {
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => search({ jump: true }), 120);
    });
  }
  doc.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    const inEditor = event.target.closest(".ace_editor, #client-options-overlay:not(.hide), #history-search-overlay:not(.hide)");
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && !event.altKey && !inEditor) {
      event.preventDefault();
      open();
    } else if (!form.classList.contains("hide") && event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (!form.classList.contains("hide") && event.key === "F3") {
      event.preventDefault();
      go(event.shiftKey ? -1 : 1);
    }
  });

  async function perform(label, action) {
    operationController?.abort();
    const controller = operationController = new AbortController();
    operation.classList.remove("hide");
    operationMessage.textContent = label;
    try {
      await yieldToBrowser();
      const snapshot = await manager.snapshot(controller.signal);
      controller.signal.throwIfAborted();
      await action(snapshot, controller.signal, (done, total) => {
        if (operationController === controller) operationMessage.textContent = label + " " + done + " / " + total;
      });
    } catch (error) {
      if (error.name !== "AbortError") report(label + " failed: " + error.message);
    } finally {
      if (operationController === controller) {
        operation.classList.add("hide");
        operationController = null;
      }
    }
  }
  doc.querySelector("#output-operation-cancel").addEventListener("click", () => operationController?.abort());
  doc.querySelectorAll("[data-output-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.dataset.panel;
      const action = button.dataset.outputAction;
      if (action === "start" || action === "end") {
        const id = manager.activeRows[panel];
        if (!id || !manager.history.get(id)) return report("Choose a line in " + panel + " output first.");
        if (action === "start") range[panel] = { start: id, end: id };
        else if (!range[panel]) return report("Choose Select from here first.");
        else range[panel].end = id;
        const { start, end } = range[panel];
        manager.views[panel].range = { start: Math.min(start, end), end: Math.max(start, end) };
        manager.views[panel].schedule();
        report(action === "start" ? "Selection starts at the chosen line." : "Range selected. Choose Copy selection.");
        return;
      }
      const selectedRange = action === "all" ? null : manager.views[panel].range;
      if (action === "copy" && !selectedRange) return report("Select a range first.");
      const predicate = scopePredicate(panel);
      perform("Preparing copied output…", async (snapshot, signal) => {
        const text = await copySnapshot(snapshot, { scope: predicate, ...selectedRange, signal });
        signal.throwIfAborted();
        if (!win.navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable. Use normal text selection or export a log.");
        await win.navigator.clipboard.writeText(text);
        report("Output copied.");
      });
    });
  });

  function saveLog() {
    perform("Preparing log…", async (snapshot, signal, progress) => {
      const parts = await exportSnapshot(snapshot, {
        client, css: win.__LOG_EXPORT_CSS__ || "", inlineCss: client.preferences.inlineLogCss !== false, signal, progress
      });
      signal.throwIfAborted();
      const filename = buildLogDownloadFilename({ isMultiMud: win.isMultiMud, gameName: win.gameName });
      if (typeof win.DomeNative?.downloadLog === "function") {
        try { win.DomeNative.downloadLog(filename, parts.join("")); return; }
        catch (error) { manager.logger.warn("Native log download failed; using browser download.", error); }
      }
      const blob = new win.Blob(parts, { type: "text/html;charset=utf-8" });
      const url = win.URL.createObjectURL(blob);
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      doc.body.append(anchor);
      anchor.click();
      anchor.remove();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
      report("Log saved.");
    });
  }

  function changed({ reset = false, routing = false } = {}) {
    const secondary = scope.querySelector("[value=secondary]");
    secondary.disabled = !manager.isSplitOpen();
    if (secondary.disabled && scope.value === "secondary") scope.value = "all";
    if (reset) {
      operationController?.abort();
      searchController?.abort();
      matches = [];
      selected = -1;
      searchedThrough = 0;
    }
    if (reset || routing) {
      const hadRange = Object.values(range).some(Boolean);
      for (const name of ["main", "secondary"]) {
        range[name] = null;
        manager.views[name].range = null;
      }
      if (routing && hadRange) report("The selected range was cleared because output window assignments changed.");
    }
    for (const name of ["main", "secondary"]) {
      const selection = manager.views[name].range;
      if (selection && selection.start < manager.history.first) {
        range[name] = null;
        manager.views[name].range = null;
        report("The selected range was cleared because some of its history was removed.");
      }
    }
    if (!form.classList.contains("hide")) {
      clearTimeout(debounce);
      debounce = setTimeout(() => search({ incremental: !reset && !routing }), 120);
    }
    updateCount();
  }
  changed();
  return { open, saveLog, changed, cancel() { operationController?.abort(); searchController?.abort(); clearTimeout(debounce); } };
}

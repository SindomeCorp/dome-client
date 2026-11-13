import { recordText } from "./history.js";
import { forEachChunked, yieldToBrowser } from "./work-queue.js";
import { renderRecordHtml } from "./record-renderer.js";
import { buildLogHtml } from "../../../shared/log-template.js";
import { buildLogDownloadFilename } from "../terminal/log-download.js";
import { SearchResults } from "./search-results.js";
import { setupOutputClipboard } from "./selection-clipboard.js";
import { logPreviewScript } from "./log-preview.js";

export async function searchSnapshot(snapshot, query, { scope = () => true, matchCase = false, signal, getRecord = (id) => snapshot.get(id) } = {}) {
  const matches = new SearchResults(query, matchCase, getRecord);
  if (!query) return matches;
  const literal = matches.expression();
  await forEachChunked(snapshot, (record) => {
    if (!scope(record)) return;
    const text = recordText(record);
    let count = 0;
    literal.lastIndex = 0;
    while (literal.exec(text)) count++;
    matches.add(record.id, count);
  }, { signal });
  return matches;
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
  parts.push(batch, logPreviewScript, suffix);
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
  const emptyMatches = () => new SearchResults("", false, (id) => manager.history.get(id));
  let matches = emptyMatches();
  let selected = -1;
  let searchedThrough = 0;
  let searching = false;
  let searchPending = false;
  let debounce;
  let refreshTimer;
  let searchSignature;
  let previousFocus;

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
    const match = matches.at(selected);
    if (!match) return;
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
    const signature = JSON.stringify([query.value, scope.value, matchCase.checked]);
    if (signature !== searchSignature) incremental = false;
    if (incremental && searching) { searchPending = true; return; }
    searchController?.abort();
    const controller = searchController = new AbortController();
    const needle = query.value;
    if (!incremental) {
      searchSignature = signature;
      searchPending = false;
      matches = emptyMatches();
      selected = -1;
      for (const view of Object.values(manager.views)) { view.highlight = null; view.schedule(); }
    }
    searching = true;
    updateCount();
    try {
      const snapshot = await manager.snapshot(controller.signal, incremental ? searchedThrough + 1 : undefined);
      if (controller.signal.aborted) return;
      const found = await searchSnapshot(snapshot, needle, {
        scope: scopePredicate(), matchCase: matchCase.checked, signal: controller.signal,
        getRecord: (id) => manager.history.get(id)
      });
      if (incremental) await matches.append(found, { signal: controller.signal });
      else matches = found;
      const before = matches.length;
      matches.prune(manager.history.first);
      selected -= before - matches.length;
      searchedThrough = snapshot.last;
      selected = selected >= 0 && selected < matches.length ? selected : matches.length ? 0 : -1;
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
    matches = emptyMatches();
    selected = -1;
    searchedThrough = 0;
    searching = false;
    searchPending = false;
    clearTimeout(refreshTimer);
    refreshTimer = null;
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
      clearTimeout(refreshTimer);
      refreshTimer = null;
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

  async function perform(label, action, boundary) {
    operationController?.abort();
    const controller = operationController = new AbortController();
    operation.classList.remove("hide");
    operationMessage.textContent = label;
    try {
      await yieldToBrowser();
      const snapshot = await manager.snapshot(controller.signal, boundary?.first, boundary?.last);
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
  const clipboard = setupOutputClipboard(manager);
  doc.querySelector("#output-operation-cancel").addEventListener("click", () => operationController?.abort());

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
    clipboard.changed({ reset, routing });
    const secondary = scope.querySelector("[value=secondary]");
    secondary.disabled = !manager.isSplitOpen();
    if (secondary.disabled && scope.value === "secondary") scope.value = "all";
    if (reset) {
      operationController?.abort();
      searchController?.abort();
      matches = emptyMatches();
      selected = -1;
      searchedThrough = 0;
    }
    if (!form.classList.contains("hide")) {
      // Throttle arrivals rather than debouncing them indefinitely during
      // continuous output. A changed query/scope still restarts the full search.
      if (reset || routing) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
        clearTimeout(debounce);
        debounce = setTimeout(() => search(), 120);
      } else if (!refreshTimer) {
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          search({ incremental: true });
        }, 120);
      }
    }
    updateCount();
  }
  changed();
  return { open, saveLog, changed, cancel() { operationController?.abort(); searchController?.abort(); clearTimeout(debounce); clearTimeout(refreshTimer); clipboard.cancel(); } };
}

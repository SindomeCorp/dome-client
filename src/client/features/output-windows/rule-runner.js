export function createRuleRunner({
  workerFactory = () => new Worker("/js/output-rules-worker.js", { type: "module" }),
  timeoutMs = 1000,
  maxPendingLines = 8192,
  onError = () => {}
} = {}) {
  let worker;
  let nextId = 0;
  const queue = new Map();
  let pendingLines = 0;
  let active;
  let unavailable = false;
  let pumpTimer;
  let lastYield = performance.now();
  const suspended = new Set();
  let configuration = 0;
  function stop() {
    worker?.terminate();
    worker = null;
  }
  function resolve(job, matches) {
    if (!job.resolve) return;
    job.detach?.();
    pendingLines -= job.length;
    job.resolve(matches || new Array(job.length).fill(false));
    job.resolve = job.lines = job.rules = job.detach = null;
  }
  function finish(matches) {
    if (!active) return;
    clearTimeout(active.timer);
    const job = active;
    active = null;
    resolve(job, matches);
    // Failed/suspended batches can complete synchronously. Yield while draining
    // them rather than recursing through a large backlog or starving input.
    if (performance.now() - lastYield >= 8) {
      pumpTimer = setTimeout(() => { lastYield = performance.now(); pump(); }, 0);
    } else queueMicrotask(pump);
  }
  function fail(message) {
    if (!active) return;
    if (!active.resolve) { stop(); finish(); return; }
    if (active.ruleId && active.configuration === configuration) suspended.add(active.ruleId);
    if (!active.ruleId) unavailable = true;
    stop();
    onError(message, active.ruleId);
    finish();
  }
  function pump() {
    if (active || !queue.size) return;
    active = queue.values().next().value;
    queue.delete(active.id);
    const rules = unavailable ? [] : active.rules.filter((rule) => !suspended.has(rule.id));
    if (!rules.length) return finish();
    try {
      if (!worker) {
        worker = workerFactory();
        worker.addEventListener("message", ({ data }) => {
          if (!active || data.id !== active.id) return;
          if (data.activeRule) {
            if (!active.resolve) return;
            active.ruleId = data.activeRule;
            // The watchdog measures execution per rule, not queueing time.
            clearTimeout(active.timer);
            active.timer = setTimeout(() => fail("A routing rule exceeded one second and was suspended."), timeoutMs);
          } else if (data.error) {
            fail(data.error);
          } else {
            finish(data.matches);
          }
        });
        const created = worker;
        worker.addEventListener("error", () => {
          if (created === worker) fail("Output routing worker failed. Unresolved output stays in main.");
        });
      }
      active.timer = setTimeout(() => fail("Output routing worker did not respond. Output stays in main."), timeoutMs);
      worker.postMessage({ id: active.id, lines: active.lines, rules, version: JSON.stringify(rules) });
    } catch {
      fail("Output routing is unavailable in this browser. Output stays in main.");
    }
  }
  return {
    match(lines, rules, { signal } = {}) {
      if (signal?.aborted || unavailable || !rules.length || !lines.length || lines.length > maxPendingLines) {
        return Promise.resolve(new Array(lines.length).fill(false));
      }
      return new Promise((done) => {
        const job = { id: ++nextId, lines, length: lines.length, rules, resolve: done, configuration };
        pendingLines += lines.length;
        const cancel = () => {
          queue.delete(job.id);
          resolve(job);
          // Let an already running worker finish under its existing watchdog.
          // Its input is already cloned; this avoids repeatedly restarting a
          // worker during bursts that prune each preceding batch.
        };
        signal?.addEventListener("abort", cancel, { once: true });
        job.detach = () => signal?.removeEventListener("abort", cancel);
        queue.set(job.id, job);
        // Bound routing memory even with unlimited scrollback. Overflow stays
        // in main in chronology order, rather than blocking all later output.
        while (pendingLines > maxPendingLines && queue.size) {
          const oldest = queue.values().next().value;
          queue.delete(oldest.id);
          resolve(oldest);
        }
        pump();
      });
    },
    reset() { configuration++; unavailable = false; suspended.clear(); },
    cancel() {
      stop();
      clearTimeout(pumpTimer);
      if (active) {
        clearTimeout(active.timer);
        resolve(active);
        active = null;
      }
      for (const job of queue.values()) resolve(job);
      queue.clear();
    },
    get pendingLines() { return pendingLines; },
    get suspended() { return suspended; }
  };
}

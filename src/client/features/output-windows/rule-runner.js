export function createRuleRunner({
  workerFactory = () => new Worker("/js/output-rules-worker.js", { type: "module" }),
  timeoutMs = 1000,
  onError = () => {}
} = {}) {
  let worker;
  let nextId = 0;
  let queue = [];
  let cursor = 0;
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
  function finish(matches) {
    if (!active) return;
    clearTimeout(active.timer);
    const job = active;
    active = null;
    job.resolve(matches || new Array(job.lines.length).fill(false));
    // Failed/suspended batches can complete synchronously. Yield while draining
    // them rather than recursing through a large backlog or starving input.
    if (performance.now() - lastYield >= 8) {
      pumpTimer = setTimeout(() => { lastYield = performance.now(); pump(); }, 0);
    } else queueMicrotask(pump);
  }
  function fail(message) {
    if (!active) return;
    if (active.ruleId && active.configuration === configuration) suspended.add(active.ruleId);
    if (!active.ruleId) unavailable = true;
    stop();
    onError(message, active.ruleId);
    finish();
  }
  function pump() {
    if (active || cursor >= queue.length) return;
    active = queue[cursor];
    queue[cursor++] = null;
    if (cursor === queue.length) { queue = []; cursor = 0; }
    const rules = unavailable ? [] : active.rules.filter((rule) => !suspended.has(rule.id));
    if (!rules.length) return finish();
    try {
      if (!worker) {
        worker = workerFactory();
        worker.addEventListener("message", ({ data }) => {
          if (!active || data.id !== active.id) return;
          if (data.activeRule) {
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
    match(lines, rules) {
      if (unavailable || !rules.length || !lines.length) return Promise.resolve(new Array(lines.length).fill(false));
      return new Promise((resolve) => {
        queue.push({ id: ++nextId, lines, rules, resolve, configuration });
        pump();
      });
    },
    reset() { configuration++; unavailable = false; suspended.clear(); },
    cancel() {
      stop();
      clearTimeout(pumpTimer);
      if (active) {
        clearTimeout(active.timer);
        active.resolve(new Array(active.lines.length).fill(false));
        active = null;
      }
      queue.slice(cursor).forEach((job) => job.resolve(new Array(job.lines.length).fill(false)));
      queue = [];
      cursor = 0;
    },
    get suspended() { return suspended; }
  };
}

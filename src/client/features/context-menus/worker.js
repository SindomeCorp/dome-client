export function createContextMatcher({ workerFactory = () => new Worker("/js/context-menus-worker.js", { type: "module" }), timeout = 500 } = {}) {
  let worker;
  let active;
  let disposed = false;
  let sequence = 0;
  const pending = [];
  function destroy(message = "Context matching stopped.") {
    disposed = true;
    worker?.terminate();
    if (active) { clearTimeout(active.timer); active.reject(new Error(message)); active = null; }
    for (const job of pending.splice(0)) job.reject(new Error(message));
  }
  function pump() {
    if (active || !pending.length || disposed) return;
    active = pending.shift();
    try {
      if (!worker) {
        worker = workerFactory();
        worker.addEventListener("message", ({ data }) => {
          if (data.id !== active?.id) return;
          clearTimeout(active.timer);
          const job = active;
          active = null;
          if (data.error) job.reject(new Error(data.error));
          else job.resolve(data.result);
          pump();
        });
        worker.addEventListener("error", () => destroy("Context menu worker failed. Native menus remain available."));
      }
      active.timer = setTimeout(() => destroy("Context menu matching timed out. Fix or reload the rules; native menus remain available."), active.type === "configure" ? 3000 : timeout);
      worker.postMessage({ id: active.id, type: active.type, ...active.payload });
    } catch (error) { destroy(error.message); }
  }
  return {
    request(type, payload) {
      if (disposed || pending.length >= 256) return Promise.reject(new Error("Context matcher unavailable or busy; native menus remain available."));
      return new Promise((resolve, reject) => { pending.push({ id: ++sequence, type, payload, resolve, reject }); pump(); });
    },
    destroy
  };
}

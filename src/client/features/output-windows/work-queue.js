export const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

export function abortable(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function forEachChunked(iterable, visit, { signal, now = () => performance.now(), budget = 8 } = {}) {
  let start = now();
  let count = 0;
  for (const value of iterable) {
    signal?.throwIfAborted();
    visit(value);
    if (++count % 64 === 0 && now() - start >= budget) {
      await yieldToBrowser();
      start = now();
    }
  }
  signal?.throwIfAborted();
}

export function createInputQueue({ now = () => performance.now(), schedule = (fn) => setTimeout(fn, 0), onError = () => {} } = {}) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  let jobs = [];
  let cursor = 0;
  let scheduled = false;
  let running = false;
  const idle = [];
  function pump() {
    scheduled = false;
    running = true;
    const start = now();
    do {
      const job = jobs[cursor];
      if (!job) break;
      try {
        if (job.text != null) {
          let end = Math.min(job.text.length, job.offset + 8192);
          if (job.text[end - 1] === "\r" && job.text[end] === "\n") end++;
          const previous = job.text.charCodeAt(end - 1);
          const next = job.text.charCodeAt(end);
          if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end++;
          // V8 substrings can retain their entire source string. Copy each small
          // chunk through UTF-8 so retained lines cannot pin a huge socket burst.
          job.consume(decoder.decode(encoder.encode(job.text.slice(job.offset, end))), job.context);
          job.offset = end;
          if (end === job.text.length) jobs[cursor++] = null;
        } else {
          jobs[cursor++] = null;
          job.consume();
        }
      } catch (error) {
        if (jobs[cursor] === job) jobs[cursor++] = null;
        onError(error);
      }
    } while (cursor < jobs.length && now() - start < 8);
    running = false;
    if (cursor < jobs.length) {
      scheduled = true;
      schedule(pump);
    } else {
      jobs = [];
      cursor = 0;
      idle.splice(0).forEach((resolve) => resolve());
    }
  }
  function add(job) {
    jobs.push(job);
    if (!scheduled && !running) {
      scheduled = true;
      schedule(pump);
    }
  }
  return {
    text(text, consume, context) { if (text) add({ text, offset: 0, consume, context }); },
    task(consume) { add({ consume }); },
    clear() { jobs = []; cursor = 0; idle.splice(0).forEach((resolve) => resolve()); },
    idle() { return cursor >= jobs.length ? Promise.resolve() : new Promise((resolve) => idle.push(resolve)); }
  };
}

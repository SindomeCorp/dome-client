const CHUNK_SIZE = 256;

export function recordText(record) {
  return record.runs.map((run) => run.text).join("");
}

export function splitRunsIntoLines(runs) {
  const lines = [];
  let line = [];
  for (const run of runs) {
    const parts = run.text.split("\n");
    parts.forEach((text, index) => {
      if (text) line.push({ ...run, text });
      if (index < parts.length - 1) {
        lines.push(line);
        line = [];
      }
    });
  }
  if (line.length) lines.push(line);
  return lines;
}

// Snapshots retain chunk references rather than copying content. A pruned
// prefix retains at most 255 additional rows until its chunk is released.
export class OutputHistory {
  constructor() {
    this.chunks = new Map();
    this.first = 1;
    this.next = 1;
    this.epoch = 0;
    this.groups = [];
    this.groupHead = 0;
    this.groupRanges = new WeakMap();
  }

  get length() { return this.next - this.first; }

  append(runs, { group = null, generation = 0, secondary = false, ready = true, echo = false } = {}) {
    const record = { id: this.next++, runs, group, generation, secondary, ready, echo };
    const key = Math.floor((record.id - 1) / CHUNK_SIZE);
    if (!this.chunks.has(key)) this.chunks.set(key, []);
    this.chunks.get(key)[(record.id - 1) % CHUNK_SIZE] = record;
    if (group) {
      let range = this.groupRanges.get(group);
      if (!range) {
        range = { group, first: record.id, last: record.id };
        this.groupRanges.set(group, range);
        this.groups.push(range);
      }
      range.last = record.id;
    }
    return record;
  }

  get(id) {
    if (id < this.first || id >= this.next) return undefined;
    return this.chunks.get(Math.floor((id - 1) / CHUNK_SIZE))?.[(id - 1) % CHUNK_SIZE];
  }

  snapshot(last = this.next - 1, from = this.first) {
    const first = Math.max(this.first, from);
    const end = Math.min(last, this.next - 1);
    const firstKey = Math.floor((first - 1) / CHUNK_SIZE);
    const chunks = [];
    if (first <= end) {
      for (let key = firstKey; key <= Math.floor((end - 1) / CHUNK_SIZE); key++) chunks.push(this.chunks.get(key));
    }
    return {
      first, last: end, epoch: this.epoch,
      get(id) {
        if (id < first || id > end) return undefined;
        return chunks[Math.floor((id - 1) / CHUNK_SIZE) - firstKey]?.[(id - 1) % CHUNK_SIZE];
      },
      *[Symbol.iterator]() {
        for (let offset = 0; offset < chunks.length; offset++) {
          const chunk = chunks[offset];
          const base = (firstKey + offset) * CHUNK_SIZE + 1;
          const start = Math.max(0, first - base);
          const stop = Math.min(chunk.length, end - base + 1);
          for (let index = start; index < stop; index++) {
            yield chunk[index];
          }
        }
      }
    };
  }

  prune(limit) {
    if (!(limit > 0) || this.length <= limit) return 0;
    const before = this.first;
    let first = this.next - limit;
    // Protocol blocks can contain interleaved local echo. Find the block span
    // crossing the cutoff, including gaps, without scanning retained rows.
    let low = this.groupHead;
    let high = this.groups.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.groups[middle].first < first) low = middle + 1;
      else high = middle;
    }
    const crossing = this.groups[low - 1];
    if (crossing && crossing.last >= first) first = crossing.last + 1;
    while (this.groupHead < this.groups.length && this.groups[this.groupHead].first < first) {
      // Also discard blocks whose entire current prefix is pruned: they may
      // still be arriving, and their later lines must not survive alone.
      const range = this.groups[this.groupHead];
      range.group.discarded = true;
      this.groupRanges.delete(range.group);
      this.groups[this.groupHead++] = null;
    }
    if (this.groupHead > 4096 && this.groupHead * 2 > this.groups.length) {
      this.groups = this.groups.slice(this.groupHead);
      this.groupHead = 0;
    }
    this.first = first;
    for (let key = Math.floor((before - 1) / CHUNK_SIZE); key < Math.floor((first - 1) / CHUNK_SIZE); key++) {
      this.chunks.delete(key);
    }
    return first - before;
  }

  clear() {
    this.chunks.clear();
    this.groups = [];
    this.groupHead = 0;
    this.groupRanges = new WeakMap();
    this.first = this.next;
    this.epoch++;
  }
}

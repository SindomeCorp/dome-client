import { recordText } from "./history.js";
import { forEachChunked } from "./work-queue.js";

const PAGE_SIZE = 1024;

// Store two numbers per matching line, regardless of its occurrence count.
// Resolve the character offset only when navigating to a particular match.
export class SearchResults {
  constructor(query, matchCase, getRecord) {
    this.query = query;
    this.matchCase = matchCase;
    this.getRecord = getRecord;
    this.pages = new Map();
    this.first = 0;
    this.next = 0;
    this.base = 0;
    this.total = 0;
  }

  get length() { return this.total - this.base; }
  get byteLength() { return this.pages.size * PAGE_SIZE * 16; }

  expression() {
    return new RegExp(this.query.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&"), this.matchCase ? "gu" : "giu");
  }

  row(index) {
    const page = this.pages.get(Math.floor(index / PAGE_SIZE));
    const offset = (index % PAGE_SIZE) * 2;
    return { id: page[offset], through: page[offset + 1] };
  }

  add(id, count) {
    if (!count) return;
    const key = Math.floor(this.next / PAGE_SIZE);
    if (!this.pages.has(key)) this.pages.set(key, new Float64Array(PAGE_SIZE * 2));
    const offset = (this.next++ % PAGE_SIZE) * 2;
    const page = this.pages.get(key);
    page[offset] = id;
    page[offset + 1] = this.total += count;
  }

  async append(other, { signal } = {}) {
    let before = other.base;
    const rows = {
      *[Symbol.iterator]() {
        for (let index = other.first; index < other.next; index++) yield other.row(index);
      }
    };
    await forEachChunked(rows, (row) => {
      this.add(row.id, row.through - before);
      before = row.through;
    }, { signal });
  }

  lowerBound(predicate) {
    let low = this.first;
    let high = this.next;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (predicate(this.row(mid))) high = mid;
      else low = mid + 1;
    }
    return low;
  }

  prune(firstId) {
    const first = this.lowerBound((row) => row.id >= firstId);
    if (first === this.first) return;
    this.base = this.row(first - 1).through;
    for (let key = Math.floor(this.first / PAGE_SIZE); key < Math.floor(first / PAGE_SIZE); key++) this.pages.delete(key);
    this.first = first;
    if (first === this.next) this.pages.clear();
    this.cached = null;
  }

  at(index) {
    if (index < 0 || index >= this.length) return undefined;
    const target = this.base + index;
    const position = this.lowerBound((row) => row.through > target);
    const row = this.row(position);
    const before = position === this.first ? this.base : this.row(position - 1).through;
    const occurrence = target - before;
    const record = this.getRecord(row.id);
    if (!record) return undefined;
    // Sequential Next operations reuse the regex cursor, even on long lines.
    if (this.cached?.id !== row.id || this.cached.occurrence > occurrence) {
      this.cached = { id: row.id, occurrence: -1, regex: this.expression(), text: recordText(record) };
    }
    while (this.cached.occurrence < occurrence) {
      this.cached.match = this.cached.regex.exec(this.cached.text);
      this.cached.occurrence++;
    }
    const match = this.cached.match;
    return { id: row.id, start: match.index, length: match[0].length };
  }
}

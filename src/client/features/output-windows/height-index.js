// Fenwick prefix heights support point updates and offset lookups in O(log n).
// A head cursor avoids shifting arrays when old output is pruned.
export class HeightIndex {
  constructor(defaultHeight = 18) {
    this.defaultHeight = defaultHeight;
    this.rows = [];
    this.heights = [];
    this.tree = [0];
    this.head = 0;
  }

  get length() { return this.rows.length - this.head; }
  get total() { return this.sum(this.rows.length) - this.sum(this.head); }
  at(index) { return this.rows[this.head + index]; }

  sum(count) {
    let value = 0;
    for (let i = count; i > 0; i -= i & -i) value += this.tree[i];
    return value;
  }

  prefix(index) {
    return this.sum(this.head + index) - this.sum(this.head);
  }

  append(row, height = this.defaultHeight) {
    const n = this.rows.length + 1;
    this.tree[n] = height + this.sum(n - 1) - this.sum(n - (n & -n));
    this.rows.push(row);
    this.heights.push(height);
  }

  measure(index, height) {
    const absolute = this.head + index;
    if (absolute < this.head || absolute >= this.rows.length || !(height > 0)) return;
    const delta = height - this.heights[absolute];
    this.heights[absolute] = height;
    for (let i = absolute + 1; i <= this.rows.length; i += i & -i) this.tree[i] += delta;
  }

  offsetIndex(offset) {
    if (!this.length) return 0;
    const target = Math.max(0, offset) + this.sum(this.head);
    let index = 0;
    let sum = 0;
    let bit = 2 ** Math.floor(Math.log2(this.rows.length));
    for (; bit; bit = Math.floor(bit / 2)) {
      const next = index + bit;
      if (next <= this.rows.length && sum + this.tree[next] <= target) {
        index = next;
        sum += this.tree[next];
      }
    }
    return Math.max(0, Math.min(this.length - 1, index - this.head));
  }

  indexOfId(id) {
    let low = 0;
    let high = this.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.at(mid).id < id) low = mid + 1;
      else high = mid;
    }
    return low < this.length && this.at(low).id === id ? low : -1;
  }

  prune(firstId) {
    while (this.head < this.rows.length && this.rows[this.head].id < firstId) this.rows[this.head++] = null;
    if (this.head > 4096 && this.head * 2 > this.rows.length) {
      const rows = this.rows.slice(this.head);
      const heights = this.heights.slice(this.head);
      this.rows = rows;
      this.heights = heights;
      this.tree = [0, ...heights];
      this.head = 0;
      for (let i = 1; i < this.tree.length; i++) {
        const parent = i + (i & -i);
        if (parent < this.tree.length) this.tree[parent] += this.tree[i];
      }
    }
  }
}

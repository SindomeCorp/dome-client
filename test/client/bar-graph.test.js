import test from "node:test";
import assert from "node:assert/strict";
import BarGraph from "../../src/client/x-bar-graph.js";

test("BarGraph draws and animates with size and maxValue", (t) => {
  const fillRects = [];
  const clearRects = [];
  const timeouts = [];

  const ctx = {
    canvas: { width: 0, height: 0 },
    clearRect: (...args) => clearRects.push(args),
    fillRect: (...args) => fillRects.push(args)
  };

  const timeoutMock = t.mock.method(globalThis, "setTimeout", (fn, delay) => {
    timeouts.push([fn, delay]);
  });
  t.after(() => timeoutMock.mock.restore());

  const graph = new BarGraph(ctx);
  graph.maxValue = 100;

  // initial draw with default size
  graph.update([50]);
  assert.equal(ctx.canvas.width, 300);
  assert.equal(ctx.canvas.height, 150);

  // change dimensions and trigger direct draw path
  graph.width = 400;
  graph.height = 200;
  graph.update([50, 50]);
  assert.equal(ctx.canvas.width, 400);
  assert.equal(ctx.canvas.height, 200);
  assert.equal(timeouts.length, 0);
  assert.equal(clearRects.length, 2);
  // ratio uses maxValue: barHeight = 99.5 when height is 200
  assert.equal(fillRects[2][3], (50 / 100) * (200 - 1));

  // reset trackers for animation path
  fillRects.length = 0;
  clearRects.length = 0;
  timeouts.length = 0;

  // arrays of equal length trigger animation loop
  graph.update([60, 40]);
  assert.equal(timeouts.length, 1);
  assert.equal(timeouts[0][1], 1);
  assert.equal(clearRects.length, 1);
  assert.equal(fillRects.length, 2);
});

test("BarGraph recomputes largest value without maxValue", (t) => {
  const fillRects = [];
  const ctx = {
    canvas: { width: 0, height: 0 },
    clearRect: () => {},
    fillRect: (...args) => fillRects.push(args)
  };
  const timeoutMock = t.mock.method(globalThis, "setTimeout", fn => { fn(); });
  t.after(() => timeoutMock.mock.restore());

  const graph = new BarGraph(ctx);
  graph.width = 100;
  graph.height = 100;

  graph.update([100, 60]);
  fillRects.length = 0;
  graph.update([50, 100]);
  assert.equal(fillRects.length, 2);
  const first = fillRects[0][3];
  const second = fillRects[1][3];
  assert.ok(first < second);
});


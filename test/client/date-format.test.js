import { test } from "node:test";
import assert from "node:assert/strict";

import { formatDate } from "../../src/client/a-date-format-date.js";

test("formats dates using tokens in UTC when requested", () => {
  const d = new Date("2020-01-02T03:04:05Z");
  assert.equal(formatDate(d, "MM/dd/yyyy", { useUTC: true }), "01/02/2020");
  assert.equal(formatDate(d, "MM/dd/yy", { useUTC: true }), "01/02/20");
  assert.equal(formatDate(d, "hh:mm t", { useUTC: true }), "3:04 am");
  assert.equal(formatDate(d, "HH:mm:ss", { useUTC: true }), "03:04:05");
});

test("defaults to the local time zone", () => {
  const d = new Date("2020-01-02T03:04:05Z");
  const expected = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  assert.equal(formatDate(d, "MM/dd/yyyy HH:mm:ss"), expected);
});

test("formats hours in 12-hour clock", () => {
  const midnight = new Date("2020-01-01T00:00:00Z");
  const afternoon = new Date("2020-01-01T13:00:00Z");
  assert.equal(formatDate(midnight, "hh", { useUTC: true }), "12");
  assert.equal(formatDate(afternoon, "hh", { useUTC: true }), "1");
});


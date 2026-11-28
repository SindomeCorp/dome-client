import { test } from "node:test";
import assert from "node:assert/strict";

import { formatDate } from "../../src/client/core/date-format.js";

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

test("local and UTC dates diverge across midnight in a non-UTC time zone", (t) => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = "America/New_York";
  t.after(() => {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  });

  const d = new Date("2024-01-01T01:02:03Z");
  assert.equal(formatDate(d), "12/31/2023");
  assert.equal(formatDate(d, "MM/dd/yy HH:mm:ss"), "12/31/23 20:02:03");
  assert.equal(formatDate(d, "MM/dd/yyyy HH:mm:ss", { useUTC: true }), "01/01/2024 01:02:03");
});

test("formats noon and midnight with the matching period", () => {
  const noon = new Date("2024-09-12T12:11:13Z");
  const midnight = new Date("2024-09-12T00:11:13Z");
  assert.equal(formatDate(noon, "MM/dd hh:mm:ss t", { useUTC: true }), "09/12 12:11:13 pm");
  assert.equal(formatDate(midnight, "hh:mm:ss t", { useUTC: true }), "12:11:13 am");
});

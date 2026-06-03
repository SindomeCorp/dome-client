import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientOptionState } from "../../src/client/client-option-schema.js";
import {
  buildClientOptionsExportFilename,
  buildClientOptionsExportPayload,
  buildClientOptionsImportPlan,
  normalizeImportedValue
} from "../../src/client/client-options-import-export.js";

test("buildClientOptionsExportPayload captures selected option state", () => {
  const exportedAt = new Date("2026-06-02T12:34:56.000Z");
  const payload = buildClientOptionsExportPayload({
    optionNames: ["commands", "buffer"],
    getOptionState: (name) => name === "commands" ? false : 42,
    exportedAt
  });

  assert.deepEqual(payload, {
    type: "dome-client-options",
    version: 1,
    exportedAt: "2026-06-02T12:34:56.000Z",
    preferences: {
      commands: false,
      buffer: 42
    }
  });
});

test("buildClientOptionsExportFilename creates filesystem-safe timestamps", () => {
  assert.equal(
    buildClientOptionsExportFilename(new Date("2026-06-02T12:34:56.789Z")),
    "dome-client-options-2026-06-02T12-34-56-789Z.json"
  );
});

test("buildClientOptionsImportPlan applies valid preferences and counts invalid known values", () => {
  const options = buildClientOptionState();
  const plan = buildClientOptionsImportPlan({
    parsed: {
      preferences: {
        commands: "false",
        edittheme: "ambiance",
        buffer: "10",
        colorset: "not-real",
        unknown: true
      }
    },
    options
  });

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.applied, [
    { name: "commands", value: false },
    { name: "edittheme", value: "ambience" },
    { name: "buffer", value: 10 }
  ]);
  assert.equal(plan.skipped, 1);
});

test("buildClientOptionsImportPlan rejects non-object payloads", () => {
  assert.deepEqual(buildClientOptionsImportPlan({ parsed: [], options: buildClientOptionState() }), {
    valid: false,
    error: "JSON must be an object of option keys."
  });
});

test("normalizeImportedValue preserves legacy editor theme aliases", () => {
  assert.equal(normalizeImportedValue("edittheme", "ambiance"), "ambience");
  assert.equal(normalizeImportedValue("edittheme", "tomorrow"), "tomorrow_night");
  assert.equal(normalizeImportedValue("commands", "true"), true);
});

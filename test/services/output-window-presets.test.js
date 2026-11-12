import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadOutputWindowPresets } from "../../src/services/output-window-presets.js";

test("bundled presets match literal prefixes only at the beginning of a line", () => {
  const source = readFileSync(new URL("../../data/output-window-presets.json", import.meta.url), "utf8");
  const presets = loadOutputWindowPresets({ readFile: () => source });
  assert.equal(presets.length, 9);
  for (const preset of presets) {
    const regex = new RegExp(preset.pattern);
    const prefix = preset.id === "ooc-messages" ? "[OOC:" : "[-][" + {
      "team-chat": "Team-Chat", "game-help": "Game-Help", "ooc-chat": "OOC-Chat",
      "bit-chat": "Bit-Chat", "rp-info": "RP-Info", "sic-comm": "SIC-COMM",
      "debug-info": "Debug-Info", "guided-discussion": "Guided-Discussion"
    }[preset.id] + "]";
    assert.ok(regex.test(prefix + " sample"));
    assert.ok(!regex.test("before " + prefix));
    assert.ok(!regex.test(prefix.toLowerCase()));
  }
});

test("invalid or missing files warn and do not prevent startup", () => {
  const warnings = [];
  const logger = { warn: (message) => warnings.push(message) };
  assert.deepEqual(loadOutputWindowPresets({ readFile: () => { throw new Error("missing"); }, logger }), []);
  assert.deepEqual(loadOutputWindowPresets({ readFile: () => "{", logger }), []);
  assert.deepEqual(loadOutputWindowPresets({ readFile: () => "{}", logger }), []);
  const rule = { id: "one", name: "One", pattern: "^one" };
  const presets = loadOutputWindowPresets({ readFile: () => JSON.stringify([rule, rule, {}, { ...rule, id: "custom-bad" }]), logger });
  assert.equal(presets.length, 1);
  assert.equal(warnings.length, 6);
});

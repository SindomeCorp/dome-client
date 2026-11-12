import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadOutputWindowPresets } from "../../src/services/output-window-presets.js";

test("bundled presets match literal prefixes only at the beginning of a line", () => {
  const source = readFileSync(new URL("../../data/output-window-presets.json", import.meta.url), "utf8");
  const presets = loadOutputWindowPresets({ readFile: () => source });
  assert.equal(presets.length, 11);
  for (const preset of presets) {
    const regex = new RegExp(preset.pattern);
    const prefix = preset.id.startsWith("puppet-") ? "[p1" : preset.id === "ooc-messages" ? "[OOC:" : "[-][" + {
      "team-chat": "Team-Chat", "game-help": "Game-Help", "ooc-chat": "OOC-Chat",
      "bit-chat": "Bit-Chat", "rp-info": "RP-Info", "sic-comm": "SIC-COMM",
      "debug-info": "Debug-Info", "guided-discussion": "Guided-Discussion"
    }[preset.id] + "]";
    assert.ok(regex.test(prefix + " sample"));
    assert.ok(!regex.test("before " + prefix));
    assert.ok(!regex.test(preset.id.startsWith("puppet-") ? prefix.toUpperCase() : prefix.toLowerCase()));
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

test("puppet presets match only case-sensitive digit prefixes at the start of a line", () => {
  const presets = loadOutputWindowPresets();
  const one = new RegExp(presets.find((preset) => preset.id === "puppet-1").pattern);
  const all = new RegExp(presets.find((preset) => preset.id === "puppet-all").pattern);
  assert.equal(one.test("[p1 puppet output"), true);
  assert.equal(one.test("[p2 puppet output"), false);
  for (let digit = 0; digit <= 9; digit++) assert.equal(all.test("[p" + digit + " puppet output"), true);
  for (const line of ["before [p1", " [p1", "[P1", "[px", "[p", "[p١"]) {
    assert.equal(all.test(line), false, line);
  }
  assert.equal(one.test("[p10 multi-digit ID"), true);
  assert.equal(all.test("[p42 multi-digit ID"), true);
});

test("preset groups default to player for older JSON and reject unknown groups", () => {
  const rule = { id: "rule", name: "Rule", pattern: "^text" };
  const warnings = [];
  const presets = loadOutputWindowPresets({
    readFile: () => JSON.stringify([rule, { ...rule, id: "admin", group: "admin" }, { ...rule, id: "bad", group: "custom" }]),
    logger: { warn: (message) => warnings.push(message) }
  });
  assert.deepEqual(presets.map((preset) => preset.group), ["player", "admin"]);
  assert.equal(warnings.length, 1);
});

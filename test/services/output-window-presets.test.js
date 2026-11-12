import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadOutputWindowPresets } from "../../src/services/output-window-presets.js";

const channels = {
  player: ["Game-Help", "Tip-Line", "Guided-Discussion", "OOC-Chat", "Fix-It", "War-Stories", "Free-Chat", "Politics-Wow"],
  gm: ["Bit-Chat", "Staff-Alerts", "Kill-Net", "Vote-Booth", "Team-Chat", "Login-Watcher", "Help-Net", "RP-Info", "Guest-Broadcaster", "Grid-Info", "Web-Watcher", "Build-Yard", "Local-OOC", "SIC-COMM", "Thought-Police", "SIC-ENC", "SIC-PM", "Commerce-Watch", "Crazy-Taxi", "Road-Rage", "Zoom-Room", "Money-Gram", "Babble-Net", "Radio-Net", "Comm-Net", "Anti-Gravity", "VR-Combat", "Stat-Watcher", "Water-Works", "NPC-net"],
  coder: ["Debug-Info", "Trace-Backs", "Eval-Log", "Security-Theater", "Action-Listener", "Code-Talk"]
};

test("bundled channel catalog preserves exact case, anchored prefixes, and supplied groups", () => {
  const source = readFileSync(new URL("../../data/output-window-presets.json", import.meta.url), "utf8");
  const presets = loadOutputWindowPresets({ readFile: () => source });
  assert.equal(presets.length, 51);
  for (const [group, names] of Object.entries(channels)) {
    for (const name of names) {
      const preset = presets.find((rule) => rule.id === name.toLowerCase());
      assert.ok(preset, name);
      assert.equal(preset.group, group, name);
      assert.equal(preset.ignoreCase, false, name);
      const regex = new RegExp(preset.pattern);
      const prefix = "[-][" + name + "]";
      assert.equal(regex.test(prefix + " sample"), true, name);
      assert.equal(regex.test("before " + prefix), false, name);
      assert.equal(regex.test(prefix.toLowerCase()), false, name);
    }
  }
  for (const [id, prefix] of [["xhelp", "XHELP "], ["sic", "|C|"], ["grid-output", "[g]"], ["ooc-messages", "[OOC:"], ["puppet-1", "[p1"], ["puppet-all", "[p9"], ["all-channels", "[-]["]]) {
    const preset = presets.find((rule) => rule.id === id);
    assert.equal(new RegExp(preset.pattern).test(prefix + " sample"), true, id);
    assert.equal(new RegExp(preset.pattern).test("before " + prefix), false, id);
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
  assert.deepEqual(presets.map((preset) => preset.group), ["player", "gm"]);
  assert.equal(warnings.length, 1);
});

test("All Channels matches channel prefixes and excludes non-channel output", () => {
  const presets = loadOutputWindowPresets();
  const all = new RegExp(presets.find((rule) => rule.id === "all-channels").pattern);
  for (const line of ["[-][Login-Watcher] joined", "[-][Grid-Info] grid", "[-][SIC-PM] private", "[-][SIC-ENC] encrypted", "[-][Local-OOC] ooc", "[-][Future-Channel] new"]) {
    assert.equal(all.test(line), true);
  }
  assert.equal(all.test("before [-][Grid-Info]"), false);
  assert.equal(all.test("[p1 puppet"), false);
});

test("Grid Output matches the literal player prefix only at the start of a line", () => {
  const preset = loadOutputWindowPresets().find((rule) => rule.id === "grid-output");
  assert.equal(preset.group, "player");
  const regex = new RegExp(preset.pattern);
  assert.equal(regex.test("[g] grid output"), true);
  for (const line of ["before [g] output", "[G] output", "[grid] output"]) assert.equal(regex.test(line), false);
});

test("player SIC matches literal pipes and never treats them as regex alternatives", () => {
  const preset = loadOutputWindowPresets().find((rule) => rule.id === "sic");
  assert.equal(preset.group, "player");
  const regex = new RegExp(preset.pattern);
  assert.equal(regex.test("|C| SIC message"), true);
  for (const line of ["ordinary output", "before |C|", "|c| message", "C", ""]) assert.equal(regex.test(line), false);
});

test("player XHELP requires the exact uppercase prefix and following space", () => {
  const preset = loadOutputWindowPresets().find((rule) => rule.id === "xhelp");
  assert.equal(preset.name, "XHELP");
  assert.equal(preset.group, "player");
  assert.equal(preset.ignoreCase, false);
  const regex = new RegExp(preset.pattern);
  assert.equal(regex.test("XHELP a request for assistance"), true);
  for (const line of ["XHELP", "XHELPER request", "before XHELP request", "xhelp request", "XHELP: request", "XHELP\trequest"]) {
    assert.equal(regex.test(line), false, line);
  }
});

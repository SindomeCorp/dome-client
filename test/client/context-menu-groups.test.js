import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildContextGroups } from "../../src/shared/context-menu-groups.js";
import { validateContextMenus, compileContextRules, matchContextRules, interpolateCommand } from "../../src/shared/context-menus.js";

async function config(id = "programmer") {
  return JSON.parse(await readFile(new URL("../../data/profiles/" + id + ".json", import.meta.url), "utf8"));
}

test("compound contexts bind each full numeric/symbolic target and reuse all owning-object actions", async () => {
  for (const id of ["programmer", "gm"]) {
    const snapshot = validateContextMenus(await config(id));
    const rules = compileContextRules([...snapshot.rules.values()]);
    for (const object of id === "gm" ? ["#123"] : ["#123", "$object"]) for (const [suffix, label] of [[":inspect", "Verb"], [".name", "Property"]]) {
      const reference = object + suffix;
      const match = matchContextRules("#999 " + reference, rules).find((match) => match.text === reference);
      const groups = buildContextGroups(snapshot, id, match);
      assert.deepEqual(groups.map((group) => group.heading), [label + " " + reference, "Object " + object]);
      assert.deepEqual(groups.map((group) => group.text), [reference, object]);
      assert.strictEqual(groups[1].actions, snapshot.rules.get(id + "-object").actions);
      assert.equal(groups[1].match.values.object, object);
      for (const group of groups) {
        const show = group.actions.find((action) => action.label === "@show");
        if (show) assert.equal(interpolateCommand(show, snapshot.rules.get(group.match.rule), group.match.values), "@show " + group.text);
      }
      assert.equal(groups[0].actions[0].action, "clipboard.copy");
      assert.equal(groups[1].actions[0].action, "clipboard.copy");
    }
    const plain = matchContextRules("#123", rules)[0];
    assert.equal(buildContextGroups(snapshot, id, plain).length, 1);
  }
});

test("context composition uses typed captures without matching the related regex again", async () => {
  const value = await config();
  value.rules.find((rule) => rule.id === "programmer-object").pattern = "(?<object>#[0-9]+)never-matches";
  const snapshot = validateContextMenus(value);
  const match = matchContextRules("#123:inspect", compileContextRules([...snapshot.rules.values()]))[0];
  assert.equal(buildContextGroups(snapshot, "programmer", match)[1].text, "#123");
  assert.deepEqual(buildContextGroups(snapshot, "missing", match), []);
  assert.deepEqual(buildContextGroups(snapshot, "programmer", { ...match, values: { ...match.values, object: "#123\n@quit" } }), []);
  const frames = JSON.parse(await readFile(new URL("../../test-support/fixtures/context-menu-frames.json", import.meta.url), "utf8"));
  const frame = matchContextRules(frames.frames[0], compileContextRules([...snapshot.rules.values()]))[0];
  assert.equal(frame.rule, "programmer-frame");
  assert.deepEqual(buildContextGroups(snapshot, "programmer", frame).map((group) => group.actions.map((action) => action.label)), [["Copy Frame"]]);
});

test("composition rejects invalid references, mappings, nesting, profile leaks and oversized menus on reload", async (t) => {
  const cases = {
    unknown: (value, verb) => { verb.relatedContexts[0].rule = "unknown"; },
    duplicate: (_value, verb) => { verb.relatedContexts.push(structuredClone(verb.relatedContexts[0])); },
    self: (_value, verb) => { verb.relatedContexts[0].rule = verb.id; },
    missing: (_value, verb) => { verb.relatedContexts[0].captures = {}; },
    incompatible: (_value, verb) => { verb.relatedContexts[0].captures.object = "verb"; },
    narrowing: (_value, _verb, object) => { object.captures.object = "object-id"; },
    unknownCapture: (_value, verb) => { verb.relatedContexts[0].captures.object = "missing"; },
    wrongType: (_value, verb) => { verb.relatedContexts[0].captures.object = ["object"]; },
    extra: (_value, verb) => { verb.relatedContexts[0].captures.extra = "object"; },
    code: (_value, verb) => { verb.relatedContexts[0].execute = "alert(1)"; },
    missingHeading: (_value, _verb, object) => { delete object.heading; },
    missingTarget: (_value, _verb, object) => { delete object.target; },
    badHeading: (_value, verb) => { verb.heading = "${unknown}"; },
    badTarget: (_value, _verb, object) => { object.target = "${object}\n@quit"; },
    nested: (_value, _verb, object) => { object.relatedContexts = [{ rule: "programmer-property", captures: { object: "object" } }]; },
    profile: (value) => { value.profiles[0].rules = ["programmer-verb"]; },
    limit: (_value, verb, object) => { object.actions = Array.from({ length: 24 }, (_, index) => ({ ...object.actions[0], id: "copy-" + index })); },
    groupLimit: (_value, verb) => { verb.relatedContexts = Array(5).fill(verb.relatedContexts[0]); },
    notArray: (_value, verb) => { verb.relatedContexts = {}; }
  };
  const relatedRuleError = /^Error: programmer-verb\.relatedContexts\[\d+\]\.rule: expected a unique known related rule$/;
  const captureError = /^Error: programmer-verb\.relatedContexts\[0\]\.captures\.object: expected a declared capture with a compatible type$/;
  const templateError = /^Error: programmer-verb\.relatedContexts\[0\]\.rule: related rule requires heading and target templates$/;
  const relatedLimit = /^Error: rules\[0\]\.relatedContexts: expected at most four related contexts$/;
  const errors = {
    unknown: relatedRuleError,
    duplicate: relatedRuleError,
    self: relatedRuleError,
    missing: captureError,
    incompatible: captureError,
    narrowing: captureError,
    unknownCapture: captureError,
    wrongType: captureError,
    extra: /programmer-verb\.relatedContexts\[0\]\.captures\.extra: unknown field/,
    code: /programmer-verb\.relatedContexts\[0\]\.execute: unknown field/,
    missingHeading: templateError,
    missingTarget: templateError,
    badHeading: /rules\[0\]\.heading: template:/,
    badTarget: /rules\[2\]\.target: template:/,
    nested: /programmer-verb\.relatedContexts\[0\]\.rule: nested or recursive related contexts are not supported/,
    profile: /profiles\[0\]\.rules: related contexts must use a rule in the same profile/,
    limit: /programmer-verb\.relatedContexts\[0\]: combined menu exceeds 24 actions/,
    groupLimit: relatedLimit,
    notArray: relatedLimit
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, async () => {
    const value = await config();
    mutate(value, value.rules[0], value.rules.find((rule) => rule.id === "programmer-object"));
    assert.throws(() => validateContextMenus(value), errors[name]);
  });
});

test("grouped context menus accept 24 total actions and identify the related rule that exceeds the limit", async () => {
  const value = await config();
  const verb = value.rules.find((rule) => rule.id === "programmer-verb");
  const object = value.rules.find((rule) => rule.id === "programmer-object");
  const extraActions = 24 - verb.actions.length - object.actions.length;
  const related = {
    ...structuredClone(object),
    id: "more-object-actions",
    heading: "More actions for ${object}",
    actions: Array.from({ length: extraActions }, (_, index) => ({ ...object.actions[0], id: "copy-" + index }))
  };
  value.rules.push(related);
  value.profiles[0].rules.push(related.id);
  verb.relatedContexts.push({ rule: related.id, captures: { object: "object" } });
  const snapshot = validateContextMenus(value);
  const match = matchContextRules("#123:inspect", compileContextRules([snapshot.rules.get(verb.id)]))[0];
  const groups = buildContextGroups(snapshot, "programmer", match);
  assert.deepEqual(groups.map((group) => group.actions.length), [verb.actions.length, object.actions.length, extraActions]);
  assert.equal(groups.flatMap((group) => group.actions).length, 24);

  related.actions.push({ ...object.actions[0], id: "one-too-many" });
  assert.throws(() => validateContextMenus(value), /^Error: programmer-verb\.relatedContexts\[1\]: combined menu exceeds 24 actions$/);
});

test("a numeric capture can widen to a related object-reference capture without evaluating expressions", async () => {
  const value = await config("gm");
  value.rules.find((rule) => rule.id === "gm-object").captures.object = "object-reference";
  const snapshot = validateContextMenus(value);
  const match = matchContextRules("#123:inspect", compileContextRules([...snapshot.rules.values()]))[0];
  const group = buildContextGroups(snapshot, "gm", match)[1];
  assert.equal(group.text, "#123");
  assert.equal(interpolateCommand(group.actions.find((action) => action.label === "Look"), snapshot.rules.get(group.match.rule), group.match.values), "look #123");
});

test("context menu validation accepts exact registry limits and rejects the next entry", () => {
  const rules = Array.from({ length: 128 }, (_, index) => ({
    id: "rule-" + index, priority: index ? -10000 : 10000,
    pattern: index ? "x" : "y".repeat(2048), captures: {}, actions: []
  }));
  const profiles = Array.from({ length: 64 }, (_, index) => ({
    id: "profile-" + index, label: "Profile " + index, rules: rules.map(({ id }) => id)
  }));
  const value = { version: 1, rules, profiles };
  const valid = validateContextMenus(value);
  assert.equal(valid.rules.size, 128);
  assert.equal(valid.profiles.size, 64);
  assert.equal(valid.rules.get("rule-0").priority, 10000);
  assert.equal(valid.rules.get("rule-127").priority, -10000);
  assert.equal(valid.profiles.get("profile-63").rules.length, 128);
  assert.throws(() => validateContextMenus({ ...value, rules: [...rules, { ...rules[0], id: "extra" }] }), /^Error: rules:/);
  assert.throws(() => validateContextMenus({ ...value, profiles: [...profiles, { ...profiles[0], id: "extra" }] }), /^Error: profiles:/);

  const updateFirstRule = (patch) => validateContextMenus({ ...value, rules: [{ ...rules[0], ...patch }, ...rules.slice(1)] });
  assert.throws(() => updateFirstRule({ pattern: "y".repeat(2049) }), /rules\[0\]\.pattern/);
  for (const priority of [10001, -10001, 1.25]) assert.throws(() => updateFirstRule({ priority }), /rules\[0\]\.priority/);
  for (const flags of ["g", "m", "ii"]) assert.throws(() => updateFirstRule({ flags }), /rules\[0\]\.flags/);
});

test("matching sorts by priority, match length, and supplied rule order", () => {
  const rules = compileContextRules([
    { id: "shorter", pattern: "#23", priority: 10, captures: {} },
    { id: "earlier-tie", pattern: "tie#42", priority: 10, captures: {} },
    { id: "longer", pattern: "beta#23tail", priority: 10, captures: {} },
    { id: "later-tie", pattern: "tie#42", priority: 10, captures: {} },
    { id: "low", pattern: "alpha#17", priority: -10, captures: {} },
    { id: "high", pattern: "#17", priority: 20, captures: {} }
  ]);
  const rank = (ordered) => matchContextRules("alpha#17 beta#23tail tie#42", ordered).map(({ rule }) => rule);
  assert.deepEqual(rank(rules), ["high", "longer", "earlier-tie", "later-tie", "shorter", "low"]);
  assert.deepEqual(rank(rules.toReversed()), ["high", "longer", "later-tie", "earlier-tie", "shorter", "low"]);
});

test("context rule matching bounds line and match counts, including reused compiled rules", () => {
  const [rule] = compileContextRules([{ id: "marker", priority: 0, pattern: "x", captures: {} }]);
  const line = "x".repeat(512).padEnd(32768, ".");
  const matches = matchContextRules(line, [rule]);
  assert.equal(matches.length, 512);
  assert.deepEqual(matches.at(-1), { rule: "marker", start: 511, end: 512, values: {}, text: "x" });
  assert.throws(() => matchContextRules(line + ".", [rule]), /line exceeds 32768/);
  assert.throws(() => matchContextRules("x".repeat(513), [rule]), /too many matches/);
  assert.equal(rule.regex.lastIndex, 0, "a rejected line leaves the compiled rule ready for reuse");
  assert.deepEqual(matchContextRules(".x", [rule]), [{ rule: "marker", start: 1, end: 2, values: {}, text: "x" }]);
});

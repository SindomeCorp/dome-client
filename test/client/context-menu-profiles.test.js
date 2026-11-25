import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { renderFile } from "ejs";
import { contextProfileRegistry, loadContextProfiles } from "../../src/shared/context-menu-profiles.js";
import { defaultContextMenus, validateContextMenus, compileContextRules, matchContextRules, interpolateCommand, validCaptures } from "../../src/shared/context-menus.js";
import { setupContextMenus } from "../../src/client/features/context-menus/controller.js";

async function files() {
  return Promise.all(Object.keys(contextProfileRegistry).map(async (id) => ({ id, config: JSON.parse(await readFile(new URL("../../data/profiles/" + id + ".json", import.meta.url), "utf8")) })));
}

function matcher() {
  let snapshot;
  return {
    async request(type, payload) {
      if (type === "configure") {
        snapshot = validateContextMenus(payload.config);
        snapshot.rules = new Map(compileContextRules([...snapshot.rules.values()]).map((rule) => [rule.id, rule]));
        matchContextRules("", [...snapshot.rules.values()]);
        return true;
      }
      return matchContextRules(payload.text, snapshot.profiles.get(payload.profile).rules.map((id) => snapshot.rules.get(id)));
    },
    destroy() {}
  };
}

async function app(t, profileLoader) {
  const html = await renderFile("views/partials/context-menus-options.ejs", {});
  const { window } = new JSDOM("<div id='context-menu-notice'></div>" + html, { url: "https://example.com" });
  const controller = setupContextMenus({ client: {}, win: window, doc: window.document, matcherFactory: matcher, profileLoader });
  t.after(() => { controller.destroy(); window.close(); });
  return { controller, window };
}

test("separate role files have exact action ordering, delimiters and safe typed interpolation", async () => {
  const expected = {
    player: { object: [], verb: [], property: [] },
    gm: { object: ["@parents #123", "@kids #123", "@notes #123", "look #123"], verb: [], property: [] },
    programmer: {
      object: ["@show #123", ";$string_utils:nn(#123)", "@verbs #123", "@props #123", "@parents #123", "@kids #123 -lcd", "@siblings #123", "@tree #123", "look #123"],
      verb: ["@edit #123:look", "@show #123:look", "@args #123:look", "help #123:look"],
      property: ["@edit #123.name", "@show #123.name"]
    }
  };
  for (const { id, config } of await files()) {
    const snapshot = validateContextMenus(config);
    const profile = snapshot.profiles.get(id);
    const rules = compileContextRules(profile.rules.map((id) => snapshot.rules.get(id)));
    for (const [kind, reference] of Object.entries({ object: "#123", verb: "#123:look", property: "#123.name" })) {
      const match = matchContextRules(reference, rules)[0];
      assert.equal(match.text, reference);
      const rule = snapshot.rules.get(match.rule);
      const commands = rule.actions.filter((action) => action.type === "game-command");
      assert.deepEqual(commands.map((action) => interpolateCommand(action, rule, match.values)), expected[id][kind]);
      const labels = expected[id][kind].map((command) => command.startsWith(";") ? "Name and Number" : command.startsWith("look ") ? "Look" : command.split(" ")[0]);
      assert.deepEqual(rule.actions.map((action) => action.label), ["Copy to Clipboard", ...labels]);
      assert.deepEqual(rule.actions[0], { id: "copy", label: "Copy to Clipboard", type: "client-action", action: "clipboard.copy", input: "target" });
      for (const action of commands) {
        for (const object of ["#123\n@quit", "#123);evil()", "#123.property"]) assert.throws(() => interpolateCommand(action, rule, { ...match.values, object }), /capture/);
        if (kind === "verb") assert.throws(() => interpolateCommand(action, rule, { ...match.values, verb: "look);evil()" }), /capture/);
        if (kind === "property") assert.throws(() => interpolateCommand(action, rule, { ...match.values, property: "name;evil" }), /capture/);
      }
    }
    assert.deepEqual(profile.selectionActions.map((action) => action.action), ["clipboard.copy", "ide.open-scratch"]);
  }
});

test("Programmer symbolic references have numeric-equivalent menus and narrow nonrecursive capture substitution", async () => {
  const { config } = (await files()).find((document) => document.id === "programmer");
  const snapshot = validateContextMenus(config);
  const rules = compileContextRules([...snapshot.rules.values()]);
  for (const suffix of ["", ":inspect", ".name"]) {
    const numeric = matchContextRules("#123" + suffix, rules)[0];
    const symbolic = matchContextRules("$object" + suffix, rules)[0];
    const rule = snapshot.rules.get(symbolic.rule);
    assert.equal(symbolic.rule, numeric.rule);
    assert.equal(symbolic.text, "$object" + suffix);
    for (const action of rule.actions.filter((action) => action.type === "game-command")) {
      assert.equal(interpolateCommand(action, rule, symbolic.values), interpolateCommand(action, rule, numeric.values).replace("#123", "$object"));
      for (const object of ["$object()", "$object.name", "$object:evil()", "$object);evil()", "$object\n@quit", "$object\n", "#123\n", "${object}", "$1bad", "$$object", "#123\u0000"]) {
        assert.equal(validCaptures(rule, { ...symbolic.values, object }), false);
        assert.throws(() => interpolateCommand(action, rule, { ...symbolic.values, object }), /capture/);
      }
    }
    for (let row = 0; row < 3; row++) {
      assert.deepEqual(matchContextRules("$object" + suffix, rules)[0], symbolic);
      assert.ok(rules.every((rule) => rule.regex.lastIndex === 0));
    }
  }
  for (const text of ["x$object", "$$object", "$123", "#$object"]) assert.deepEqual(matchContextRules(text, rules), []);
  for (const { id, config } of await files()) {
    if (id === "programmer") continue;
    const snapshot = validateContextMenus(config);
    assert.deepEqual(matchContextRules("$object $object:inspect $object.name", compileContextRules([...snapshot.rules.values()])), []);
  }
});

test("source-shaped traceback frames win over embedded verbs and copy the complete frame without executable captures", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../test-support/fixtures/context-menu-frames.json", import.meta.url), "utf8"));
  const { config } = (await files()).find((document) => document.id === "programmer");
  const snapshot = validateContextMenus(config);
  const rules = compileContextRules([...snapshot.rules.values()]);
  for (const frame of fixture.frames) {
    const matches = matchContextRules(frame, rules);
    const first = matches[0];
    assert.equal(first.rule, "programmer-frame");
    assert.equal(first.text, frame);
    assert.ok(matches.some((match) => match.rule === "programmer-verb"));
    assert.deepEqual(snapshot.rules.get(first.rule).actions, [{ id: "copy-frame", label: "Copy Frame", type: "client-action", action: "clipboard.copy", input: "target" }]);
    assert.deepEqual(Object.keys(first.values), ["object", "verb", "line"]);
  }
  for (const text of fixture.unsupported) assert.ok(!matchContextRules(text, rules).some((match) => match.rule === "programmer-frame"));
  const frameRule = snapshot.rules.get("programmer-frame");
  const action = { segments: [{ capture: "line" }] };
  for (const line of ["0", "-1", "1;evil()", "1\n@quit", "1000000000"]) assert.throws(() => interpolateCommand(action, frameRule, { object: "#123", verb: "inspect", line }), /capture/);
});

test("file loader fetches only exact registry paths and rejects missing, malformed or misidentified files", async () => {
  const documents = await files();
  const requests = [];
  const fetchFn = async (path) => {
    requests.push(path);
    const document = documents.find((document) => contextProfileRegistry[document.id] === path);
    return { ok: true, text: async () => JSON.stringify(document.config) };
  };
  const loaded = await loadContextProfiles({ fetchFn });
  assert.deepEqual(requests, Object.values(contextProfileRegistry));
  assert.equal(loaded.errors.length, 0);
  assert.equal(loaded.documents.length, 3);
  requests.length = 0;
  assert.deepEqual(await loadContextProfiles({ fetchFn, ids: ["../programmer", "https://evil.test/body", "programmer_body", "gm-staff"] }), { documents: [], errors: [] });
  assert.deepEqual(requests, []);
  for (const response of [
    { ok: false, status: 404 },
    { ok: true, text: async () => "{" },
    { ok: true, text: async () => JSON.stringify(documents[0].config) },
    { ok: true, text: async () => "x".repeat(262145) }
  ]) {
    const invalid = await loadContextProfiles({ fetchFn: async () => response, ids: ["gm"] });
    assert.equal(invalid.documents.length, 0);
    assert.match(invalid.errors[0], /^gm:/);
  }
});

test("file selection reuses compiled revisions, falls back on failure, preserves override and reloads atomically", async (t) => {
  let documents = await files();
  let fail = false;
  const { controller, window } = await app(t, async (ids) => fail ? { documents: [], errors: ["gm: HTTP 404"] } : { documents: documents.filter((document) => !ids || ids.includes(document.id)), errors: [] });
  await controller.ready;
  assert.deepEqual([...controller.snapshot.profiles.keys()], ["player", "gm", "programmer"]);
  const revision = controller.revision;
  await controller.setServerProfile("programmer");
  assert.equal(controller.active().profile.id, "programmer");
  await controller.setServerProfile("gm");
  assert.equal(controller.active().profile.id, "gm");
  window.document.querySelector("#context-menu-notice").textContent = "sentinel";
  await controller.setServerProfile("gm");
  assert.equal(window.document.querySelector("#context-menu-notice").textContent, "sentinel");
  assert.equal(controller.revision, revision, "unchanged file contents and profile switches must reuse the compiled snapshot");
  controller.update({ override: true, profile: "programmer" });
  fail = true;
  await controller.setServerProfile("gm");
  assert.equal(controller.active().source, "Override");
  controller.update({ override: false });
  assert.equal(controller.active().source, "Fallback");
  assert.equal(controller.active().profile.id, "player");
  assert.equal(await controller.reload(JSON.stringify(defaultContextMenus())), false);
  assert.equal(controller.revision, revision);
  fail = false;
  await controller.setServerProfile("gm");
  assert.equal(controller.active().source, "selected by server");
  documents = structuredClone(documents);
  documents[1].config.rules[2].actions.find((action) => action.id === "command-0").label = "Updated parents";
  assert.equal(await controller.reload(JSON.stringify(defaultContextMenus())), true);
  assert.equal(controller.revision, revision + 1);
  assert.equal(controller.snapshot.rules.get("gm-object").actions.find((action) => action.id === "command-0").label, "Updated parents");
  controller.resetSession();
  assert.equal(controller.active().source, "Fallback");
});

test("late file results cannot restore a session or overwrite newer JSON; hyphens and underscores stay distinct", async (t) => {
  const documents = await files();
  let finish;
  let delay = false;
  const { controller } = await app(t, async () => delay ? new Promise((resolve) => { finish = resolve; }) : { documents, errors: [] });
  await controller.ready;
  delay = true;
  const selection = controller.setServerProfile("programmer");
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.resetSession();
  finish({ documents, errors: [] });
  await selection;
  assert.equal(controller.active().source, "Fallback");
  const slow = controller.reload(JSON.stringify(defaultContextMenus()));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const finishSlow = finish;
  delay = false;
  const local = defaultContextMenus();
  local.profiles.push({ ...local.profiles[0], id: "support-gm", label: "Hyphen" }, { ...local.profiles[0], id: "support_gm", label: "Underscore" });
  await controller.reload(JSON.stringify(local));
  finishSlow({ documents, errors: [] });
  assert.equal(await slow, false);
  await controller.setServerProfile("support-gm");
  assert.equal(controller.active().profile.label, "Hyphen");
  await controller.setServerProfile("support_gm");
  assert.equal(controller.active().profile.label, "Underscore");
  await controller.setServerProfile("support/gm");
  assert.equal(controller.active().source, "Fallback");
  delay = true;
  local.profiles[0].label = "Latest local draft";
  const editing = controller.reload(JSON.stringify(local));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await controller.setServerProfile("gm");
  finish({ documents, errors: [] });
  assert.equal(await editing, true);
  assert.equal(controller.config.profiles[0].label, "Latest local draft");
  assert.equal(controller.active().profile.id, "gm");
});

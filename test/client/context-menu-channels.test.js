import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateContextMenus, compileContextRules, matchContextRules, interpolateCommand, validCaptures } from "../../src/shared/context-menus.js";

async function config(profile) {
  return JSON.parse(await readFile(new URL("../../data/profiles/" + profile + ".json", import.meta.url), "utf8"));
}

test("all shipped profiles wildcard both channel tag signs and send the exact single rewind argument", async () => {
  for (const id of ["player", "gm", "programmer"]) {
    const snapshot = validateContextMenus(await config(id));
    const rules = compileContextRules(snapshot.profiles.get(id).rules.map((id) => snapshot.rules.get(id)));
    const rule = snapshot.rules.get(id + "-channel");
    assert.deepEqual(rule.actions.map((action) => action.label), ["@rewind"]);
    for (const sign of ["+", "-"]) for (const name of ["Login-Watcher", "Bit-Chat", "SIC-COMM", "SIC-PM", "Any channel 42", "  padded name  ", "quotes \"; (punctuation)", "${object}", "频道-λ", "name[part", "#123:inspect"]) {
      const tag = "[" + sign + "][" + name + "]";
      const matches = matchContextRules("before " + tag + " after", rules);
      assert.equal(matches[0].rule, rule.id);
      assert.equal(matches[0].text, tag);
      assert.equal(matches[0].values.channel, name);
      assert.equal(interpolateCommand(rule.actions[0], rule, matches[0].values), "@rewind " + name);
      assert.ok(rules.every((rule) => rule.regex.lastIndex === 0));
    }
    assert.deepEqual(matchContextRules("[+][first] [-][second]", rules).sort((first, second) => first.start - second.start).map((match) => match.values.channel), ["first", "second"]);
    for (const tag of ["[SIC-PM]", "[x][SIC-PM]", "[+][]", "[-][   ]", "[-][unfinished", "[-][bad\nname]", "[-][bad\rname]", "[-][bad\u0000name]", "[-][" + "x".repeat(129) + "]"]) assert.deepEqual(matchContextRules(tag, rules), [], tag);
    for (const channel of ["", " ", "bad]name", "bad\n@quit", "bad\rname", "bad\u2028name", "bad\u0000name", "x".repeat(129)]) {
      assert.equal(validCaptures(rule, { channel }), false);
      assert.throws(() => interpolateCommand(rule.actions[0], rule, { channel }), /capture/);
    }
  }
});

test("wildcard channel captures cannot be used as executable expressions, command names or quoted fragments", async () => {
  for (const template of ["${channel}", "@eval ${channel}", ";${channel}", ";foo(\"${channel}\")", "@rewind \"${channel}\"", "@rewind ${channel} extra", "@rewind ${channel}${channel}", "@rewind ${channel}\n@quit"]) {
    const value = await config("player");
    value.rules[0].actions[0].template = template;
    assert.throws(() => validateContextMenus(value), /template/, template);
  }
  const snapshot = validateContextMenus(await config("player"));
  const rule = snapshot.rules.get("player-channel");
  assert.throws(() => interpolateCommand({ type: "game-command", segments: [{ literal: "@eval " }, { capture: "channel" }] }, rule, { channel: "do_not_run()" }), /whole-argument/);
});

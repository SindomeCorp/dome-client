import { referenceContextMenus } from "../../test-support/context-menu-reference-fixture.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import ejs from "ejs";
import { CONTEXT_MENUS_KEY, validateContextMenus, compileContextRules, matchContextRules, parseCommandTemplate, interpolateCommand } from "../../src/shared/context-menus.js";
import { setupContextMenus } from "../../src/client/features/context-menus/controller.js";
import { setupClientOptionsTabs } from "../../src/client/features/options/page/tabs.js";
import { createContextMatcher } from "../../src/client/features/context-menus/worker.js";
import { projectOutputRow, characterAtPoint } from "../../src/client/features/context-menus/output.js";
import { CONTEXT_UNDERLINE } from "../../src/client/features/context-menus/underlines.js";
import { createSocketOutputProtocolParser } from "../../src/client/features/terminal/socket-output-protocol.js";

test("disabled context menus create no controller, worker or profile requests despite saved overrides", () => {
  const { window } = new JSDOM("", { url: "http://localhost" });
  try {
    window.__CONTEXT_MENUS__ = { enabled: false };
    window.localStorage.setItem(CONTEXT_MENUS_KEY, JSON.stringify(referenceContextMenus()));
    window.localStorage.setItem(CONTEXT_MENUS_KEY + "-preferences", JSON.stringify({ override: true, profile: "programmer", underline: true }));
    const client = {};
    const unexpected = () => { assert.fail("Disabled context menus must not initialize"); };
    assert.equal(setupContextMenus({ client, doc: window.document, win: window, matcherFactory: unexpected, profileLoader: unexpected }), null);
    assert.equal(client.contextMenus, undefined);
  } finally { window.close(); }
});

function localMatcher() {
  let snapshot;
  return {
    async request(type, payload) {
      if (type === "configure") { snapshot = validateContextMenus(payload.config); return true; }
      return matchContextRules(payload.text, snapshot.profiles.get(payload.profile).rules.map((id) => snapshot.rules.get(id)));
    },
    destroy() {}
  };
}

async function fixture(t, saved, preferences) {
  const html = await ejs.renderFile("views/partials/context-menus-options.ejs", {});
  const { window } = new JSDOM("<div id='context-menu-notice' hidden></div>" + html, { url: "http://localhost", pretendToBeVisual: true });
  window.localStorage.setItem(CONTEXT_MENUS_KEY, saved || JSON.stringify(referenceContextMenus()));
  if (preferences) window.localStorage.setItem(CONTEXT_MENUS_KEY + "-preferences", JSON.stringify(preferences));
  const sends = [];
  const scratches = [];
  const client = { socketState: 1, socket: { emit: (...args) => sends.push(args) }, openIDE: (editor) => scratches.push(editor) };
  const controller = setupContextMenus({ client, doc: window.document, win: window, matcherFactory: localMatcher });
  await controller.ready;
  t.after(() => { controller.destroy(); window.close(); });
  return { window, doc: window.document, client, controller, sends, scratches };
}

test("reference underlining defaults off and persists only a validated boolean preference", async (t) => {
  const { controller, doc, window } = await fixture(t);
  assert.equal(controller.preferences.underline, false);
  assert.equal(doc.querySelector("#context-menu-underline").checked, false);
  assert.equal(doc.querySelector("#context-menu-underline").disabled, true);
  assert.equal(doc.querySelector("#context-menu-underline").getAttribute("aria-describedby"), "context-menu-underline-help");
  controller.update({ underline: true });
  assert.equal(JSON.parse(window.localStorage.getItem(CONTEXT_MENUS_KEY + "-preferences")).underline, true);
  const restored = await fixture(t, undefined, { underline: true });
  assert.equal(restored.controller.preferences.underline, true);
  const invalid = await fixture(t, undefined, { underline: "true" });
  assert.equal(invalid.controller.preferences.underline, false);
  invalid.controller.update({ underline: "true" });
  assert.equal(invalid.controller.preferences.underline, false);
});

test("late underline matches cannot paint changed or detached output", { timeout: 5000 }, async (t) => {
  const { controller, doc, window } = await fixture(t);
  window.Highlight = Set;
  window.CSS = { highlights: new Map() };
  controller.update({ underline: true });
  const output = doc.createElement("div");
  assert.equal(doc.querySelector("#context-menu-underline").getAttribute("aria-describedby"), null);
  const row = doc.createElement("div");
  row.textContent = "Old #123";
  output.append(row);
  doc.body.append(output);
  const matches = [{ rule: "object", start: 4, end: 8, text: "#123", values: { object: "#123" } }];
  let started = Promise.withResolvers();
  const { promise: matchedNewText, resolve: sawNewText } = Promise.withResolvers();
  const match = controller.match.bind(controller);
  controller.match = (text) => {
    if (text === "New") sawNewText();
    if (text !== "Old #123") return match(text);
    const pending = Promise.withResolvers();
    started.resolve(pending.resolve);
    return pending.promise;
  };
  controller.bindOutput(output, window);
  const finishChangedRow = await started.promise;
  row.firstChild.data = "New";
  finishChangedRow(matches);
  await matchedNewText;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(doc.querySelector("#context-menu-error").textContent, "");
  assert.equal(window.CSS.highlights.get(CONTEXT_UNDERLINE).size, 0);

  started = Promise.withResolvers();
  row.textContent = "Old #123";
  const finishDetachedRow = await started.promise;
  row.remove();
  finishDetachedRow(matches);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.CSS.highlights.get(CONTEXT_UNDERLINE).size, 0);
});

test("Context Menus Basic and Advanced tabs default to Basic and support keyboard navigation", async (t) => {
  const { doc, window } = await fixture(t);
  setupClientOptionsTabs({ root: doc });
  const basic = doc.querySelector("#context-menu-tab-basic");
  const advanced = doc.querySelector("#context-menu-tab-advanced");
  assert.equal(basic.getAttribute("aria-selected"), "true");
  assert.equal(doc.querySelector("#context-menu-panel-advanced").classList.contains("hide"), true);
  assert.equal(doc.querySelector("#context-menu-fallback"), null);
  basic.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
  assert.equal(doc.activeElement, advanced);
  assert.equal(advanced.getAttribute("aria-selected"), "true");
  assert.equal(doc.querySelector("#context-menu-panel-basic").classList.contains("hide"), true);
  assert.equal(doc.querySelector("#context-menu-panel-advanced").classList.contains("hide"), false);
  advanced.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
  assert.equal(doc.activeElement, basic);
  assert.equal(basic.getAttribute("tabindex"), "0");
  assert.equal(advanced.getAttribute("tabindex"), "-1");
});

test("automatic fallback prefers Player, ignores legacy fallback settings, then uses the first profile or disables menus", async (t) => {
  const config = referenceContextMenus();
  config.profiles.unshift({ ...config.profiles[0], id: "local-gm", label: "GM" });
  const { controller, doc, window } = await fixture(t, JSON.stringify(config), { override: false, profile: "local-gm", fallback: "local-gm" });
  assert.equal(controller.active().profile.id, "player");
  controller.update({ override: true });
  assert.equal(controller.active().profile.id, "local-gm");
  controller.update({ override: false, fallback: "local-gm" });
  assert.equal(controller.active().profile.id, "player");
  assert.equal(Object.hasOwn(controller.preferences, "fallback"), false);
  assert.equal(Object.hasOwn(JSON.parse(window.localStorage.getItem(CONTEXT_MENUS_KEY + "-preferences")), "fallback"), false);
  await controller.setServerProfile("local-gm");
  assert.equal(controller.active().source, "selected by server");
  controller.resetSession();
  assert.equal(controller.active().profile.id, "player");
  config.profiles = config.profiles.filter((profile) => profile.id !== "player");
  assert.equal(await controller.reload(JSON.stringify(config)), true);
  assert.equal(controller.active().profile.id, "local-gm");
  assert.equal(controller.active().source, "Fallback");
  assert.equal(await controller.reload(JSON.stringify({ version: 1, rules: [], profiles: [] })), true);
  assert.deepEqual(controller.active(), { profile: null, source: "Disabled" });
  assert.deepEqual(await controller.match("#123"), []);
  assert.throws(() => controller.activate({ type: "game-command" }, { session: controller.session, revision: controller.revision, profile: null }), /Context changed/);
  assert.equal(doc.querySelector("#context-menu-override").disabled, true);
  assert.equal(doc.querySelector("#context-menu-profile").disabled, true);
  assert.match(doc.querySelector("#context-menu-active").textContent, /^Active Profile: Disabled/);
  const output = doc.createElement("div");
  const row = doc.createElement("div");
  row.textContent = "#123";
  output.append(row);
  doc.body.append(output);
  controller.bindOutput(output, window);
  doc.getSelection().selectAllChildren(row);
  for (const event of [new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }), new window.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true })]) {
    row.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(doc.querySelector("[role=menu]"), null);
  assert.equal(await controller.reload(JSON.stringify(referenceContextMenus())), true);
  assert.equal(controller.active().profile.id, "player");
  assert.equal(doc.querySelector("#context-menu-override").disabled, false);
});

test("default rules choose complete ANSI-independent verb, property, then object references", () => {
  const snapshot = validateContextMenus(referenceContextMenus());
  const rules = [...snapshot.rules.values()];
  const matches = matchContextRules("#123:look #123.name #123", rules);
  assert.equal(matches[0].rule, "verb");
  assert.equal(matches[0].values.object, "#123");
  assert.equal(matches[1].rule, "property");
  assert.deepEqual(matchContextRules("#123abc abc#123", rules), []);
  assert.throws(() => matchContextRules("x".repeat(32769), rules), /exceeds/);
  assert.throws(() => matchContextRules("", [{ ...rules[0], pattern: "", captures: {} }]), /zero-length/);
});

test("user command names are data; parsed placeholders interpolate once with typed captures", () => {
  const rule = { captures: { object: "object-id", verb: "verb-name", property: "property-name" } };
  const values = { object: "#123", verb: "look", property: "name" };
  for (const name of ["@show", "@verbs", "@new-user-command"]) {
    const segments = parseCommandTemplate(name + " ${object} $$literal ${verb} ${property}", rule.captures);
    assert.equal(interpolateCommand({ segments }, rule, values), name + " #123 $literal look name");
  }
  for (const template of ["@show ${selection}", "@show ${object.trim()}", "@show $1", "@show ${object", "@show\n${object}", "@show\t${object}", "@show\u2028${object}"]) {
    assert.throws(() => parseCommandTemplate(template, rule.captures));
  }
  for (const value of ["123", "#1\n@quit", "#1;foo", "${object}", undefined]) {
    assert.throws(() => interpolateCommand({ segments: [{ capture: "object" }] }, { captures: { object: "object-id" } }, { object: value }), /capture/);
  }
});

test("configuration rejects executable fields, unknown client IDs, invalid captures and selection commands", () => {
  const mutations = [
    (value) => { value.version = 2; },
    (value) => { value.code = "alert(1)"; },
    (value) => { value.rules[0].pattern = "["; },
    (value) => { value.rules[0].flags = "g"; },
    (value) => { value.rules[0].captures.object = "text"; },
    (value) => { value.rules[0].captures.missing = "object-id"; },
    (value) => { value.rules[0].actions[0].action = "window.eval"; },
    (value) => { value.rules[0].actions[0].template = "evil"; },
    (value) => { value.rules[0].actions[0].id = null; },
    (value) => { value.rules[0].actions[0].input = "selection"; },
    (value) => { value.rules[0].actions[0] = { id: "bad", label: "Bad", type: "game-command", template: "@show ${missing}" }; },
    (value) => { value.profiles[0].selectionActions = [{ id: "bad", label: "Run", type: "game-command", template: "@show ${object}" }]; },
    (value) => { value.profiles[0].rules.push("missing"); },
    (value) => { value.profiles.push(value.profiles[0]); }
  ];
  for (const mutate of mutations) { const value = referenceContextMenus(); mutate(value); assert.throws(() => validateContextMenus(value)); }
});

test("Options reload atomically registers local profiles and global override restores latest session OOB", async (t) => {
  const { controller, doc, window, sends } = await fixture(t);
  assert.equal(doc.querySelector("#context-menu-profile").disabled, true);
  const value = referenceContextMenus();
  value.profiles.push({ ...value.profiles[0], id: "staff", label: "Programmer" });
  value.profiles.push({ ...value.profiles[0], id: "local", label: "My local tools" });
  doc.querySelector("#context-menu-json").value = JSON.stringify(value);
  doc.querySelector("#context-menu-reload").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.setServerProfile("staff");
  assert.match(doc.querySelector("#context-menu-active").textContent, /Programmer \(selected by server\)/);
  const notice = doc.querySelector("#context-menu-notice");
  notice.textContent = "sentinel";
  controller.setServerProfile("staff");
  assert.equal(notice.textContent, "sentinel");
  const checkbox = doc.querySelector("#context-menu-override");
  checkbox.click();
  const dropdown = doc.querySelector("#context-menu-profile");
  dropdown.value = "local";
  dropdown.dispatchEvent(new window.Event("change"));
  assert.equal(controller.active().profile.id, "local");
  assert.equal(controller.active().source, "Override");
  controller.setServerProfile("player");
  assert.equal(controller.active().profile.id, "local");
  checkbox.click();
  assert.equal(controller.active().profile.id, "player");
  assert.equal(controller.active().source, "selected by server");
  controller.resetSession();
  assert.equal(controller.active().source, "Fallback");
  assert.equal(JSON.parse(window.localStorage.getItem(CONTEXT_MENUS_KEY + "-preferences")).profile, "local");
  const revision = controller.revision;
  assert.equal(await controller.reload("{"), false);
  assert.equal(controller.revision, revision);
  assert.match(doc.querySelector("#context-menu-error").textContent, /Previous valid/);
  controller.setServerProfile({ template: "@quit" });
  assert.equal(controller.active().source, "Fallback");
  assert.deepEqual(sends, []);
});

test("explicit typed actions reject stale sessions and never substitute selection text", async (t) => {
  const { controller, client, doc, sends, scratches } = await fixture(t);
  const value = referenceContextMenus();
  value.rules[2].actions.push({ id: "verbs", label: "My verbs", type: "game-command", template: "@verbs ${object}" });
  await controller.reload(JSON.stringify(value));
  const rule = controller.snapshot.rules.get("object");
  const context = { kind: "token", session: controller.session, revision: controller.revision, profile: "player", doc, match: { rule: "object", values: { object: "#123" } } };
  controller.activate(rule.actions[1], context);
  assert.deepEqual(sends, [["input", "@verbs #123"]]);
  assert.throws(() => controller.activate(rule.actions[1], { ...context, kind: "selection", text: "@quit" }), /Selections/);
  client.socketState = 0;
  assert.throws(() => controller.activate(rule.actions[1], context), /Connect/);
  controller.resetSession();
  assert.throws(() => controller.activate(rule.actions[1], context), /changed/);
  const selection = { ...context, kind: "selection", session: controller.session, text: "\n@quit\n.\n" };
  controller.activate(controller.active().profile.selectionActions[1], selection);
  assert.deepEqual(scratches, [{ contextScratch: true, buffer: selection.text }]);
  assert.equal(sends.length, 1);
});

test("saved invalid JSON falls back safely and OOB accepts only IDs across fragments", async (t) => {
  const { controller, doc } = await fixture(t, "{");
  assert.equal(controller.active().profile.id, "player");
  assert.equal((await controller.match("[-][SIC-PM] Example"))[0]?.text, "[-][SIC-PM]");
  assert.match(doc.querySelector("#context-menu-error").textContent, /Previous valid/);
  const parser = createSocketOutputProtocolParser();
  assert.deepEqual(parser.parse("#$# SDWC%%CONTEXT-PRO"), []);
  assert.deepEqual(parser.parse("FILE%%\"player\"\r\n"), [{ type: "context-profile", id: "player" }]);
  for (const payload of ["{}", "[]", "null", "bad", "\"https://evil\"", "{\"id\":\"player\",\"template\":\"@quit\"}"]) {
    assert.deepEqual(parser.parse("#$# SDWC%%CONTEXT-PROFILE%%" + payload + "\n"), [{ type: "context-profile", id: null }]);
  }
  assert.deepEqual(parser.parse("#$# SDWC%%CONTEXT-RESET\n"), [{ type: "context-reset" }]);
});

test("display projection crosses ANSI/Find spans and omits preview controls", () => {
  const { window } = new JSDOM("<div id='row'><span>#12</span><mark>3:</mark><span>look</span><button>▾</button><span data-preview-for='x'>ignored</span></div>");
  const row = window.document.querySelector("#row");
  const projection = projectOutputRow(row);
  assert.equal(projection.text, "#123:look");
  window.document.caretPositionFromPoint = () => ({ offsetNode: projection.nodes[1].node, offset: 1 });
  const original = window.document.createRange.bind(window.document);
  window.document.createRange = () => { const range = original(); range.getClientRects = () => [{ left: 10, right: 20, top: 10, bottom: 20 }]; return range; };
  assert.equal(characterAtPoint(window.document, projection, 15, 15), 4);
  assert.equal(characterAtPoint(window.document, projection, 50, 50), null);
  window.close();
});

test("pointer targeting handles both caret APIs and the edges of split display text", (t) => {
  const { window } = new JSDOM("<div id='row'><span>#12</span><mark>3:</mark><span>look</span><button>▾</button></div>");
  t.after(() => window.close());
  const doc = window.document;
  const row = doc.querySelector("#row");
  const projection = projectOutputRow(row);
  const { node } = projection.nodes[1];

  const createRange = doc.createRange.bind(doc);
  doc.createRange = () => {
    const range = createRange();
    range.getClientRects = () => {
      assert.equal(range.startContainer, node);
      assert.equal(range.endOffset, range.startOffset + 1);
      const left = 10 + 10 * range.startOffset;
      return [{ left, right: left + 10, top: 10, bottom: 20 }];
    };
    return range;
  };
  doc.caretRangeFromPoint = () => ({ startContainer: node, startOffset: node.length });
  assert.equal(characterAtPoint(doc, projection, 30, 20), 4, "a caret after the span can still hit its last glyph");
  doc.caretPositionFromPoint = () => null;
  assert.equal(characterAtPoint(doc, projection, 25, 15), 4, "fall back when the newer API finds nothing");
  delete doc.caretRangeFromPoint;
  assert.equal(characterAtPoint(doc, projection, 25, 15), null, "keep native interaction if neither caret API has a position");

  doc.caretRangeFromPoint = () => assert.fail("the newer caret result should take precedence");
  doc.caretPositionFromPoint = () => ({ offsetNode: node, offset: 0 });
  assert.equal(characterAtPoint(doc, projection, 10, 10), 3, "a zero UTF-16 offset is valid");
  for (const [x, y] of [[9, 15], [21, 15], [15, 9], [15, 21]]) {
    assert.equal(characterAtPoint(doc, projection, x, y), null, "adjacent whitespace is outside the glyph");
  }

  doc.caretPositionFromPoint = () => ({ offsetNode: row.querySelector("button").firstChild, offset: 0 });
  assert.equal(characterAtPoint(doc, projection, 15, 15), null, "excluded controls have no text match offset");
});

test("worker watchdog terminates pathological jobs and does not run a synchronous fallback", async () => {
  const handlers = {};
  let terminated = false;
  const matcher = createContextMatcher({ timeout: 5, workerFactory: () => ({ addEventListener: (type, handler) => { handlers[type] = handler; }, postMessage() {}, terminate() { terminated = true; } }) });
  await assert.rejects(matcher.request("match", { text: "x" }), /timed out/);
  assert.equal(terminated, true);
  await assert.rejects(matcher.request("match", {}), /unavailable/);
});

test("compiled rules reset row state after repeated matches, caps and zero-length errors", () => {
  const rules = compileContextRules([...validateContextMenus(referenceContextMenus()).rules.values()]);
  const expected = matchContextRules("#123:look #123.name #123", rules);
  for (const rule of rules) rule.regex.lastIndex = 1000;
  assert.deepEqual(matchContextRules("#123:look #123.name #123", rules), expected);
  assert.deepEqual(matchContextRules("ordinary text", rules), []);
  assert.deepEqual(matchContextRules("#123:look #123.name #123", rules), expected);
  assert.throws(() => matchContextRules("#1 ".repeat(513), rules), /too many matches/);
  assert.ok(rules.every((rule) => rule.regex.lastIndex === 0));
  assert.deepEqual(matchContextRules("#123:look #123.name #123", rules), expected);
  const empty = compileContextRules([{ ...rules[0], pattern: "(?=a)", captures: {} }]);
  assert.throws(() => matchContextRules("a", empty), /zero-length/);
  assert.equal(empty[0].regex.lastIndex, 0);
  assert.deepEqual(matchContextRules("b", empty), []);
});

test("the shipped worker reuses compiled rules across rows and profiles and replaces them only on valid reload", async (t) => {
  let handler;
  const responses = [];
  const previous = globalThis.self;
  const OriginalRegExp = globalThis.RegExp;
  const compiled = [];
  globalThis.RegExp = class extends OriginalRegExp {
    constructor(source, flags) {
      super(source, flags);
      if (flags?.includes("g")) compiled.push(this);
    }
  };
  globalThis.self = { addEventListener(_type, callback) { handler = callback; }, postMessage(message) { responses.push(message); } };
  t.after(() => {
    globalThis.RegExp = OriginalRegExp;
    if (previous === undefined) delete globalThis.self;
    else globalThis.self = previous;
  });
  await import("../../src/client/entrypoints/context-menus-worker.js");
  let sequence = 0;
  const send = (type, payload) => {
    handler({ data: { id: ++sequence, type, ...payload } });
    return responses.pop();
  };
  const config = referenceContextMenus();
  config.profiles.push({ id: "objects", label: "Objects", rules: ["object"] });
  assert.equal(send("configure", { config }).result, true);
  assert.equal(compiled.length, 3);
  const result = send("match", { profile: "player", text: "#123:look" });
  assert.equal(result.result[0].rule, "verb");
  assert.deepEqual(result.result[0].values, { object: "#123", verb: "look" });
  for (const regex of compiled) regex.lastIndex = 1000;
  assert.deepEqual(send("match", { profile: "player", text: "#123:look" }).result, result.result);
  assert.deepEqual(send("match", { profile: "objects", text: "#123:look" }).result.map((match) => match.rule), ["object"]);
  assert.deepEqual(send("match", { profile: "player", text: "#123:look" }).result, result.result);
  assert.equal(compiled.length, 3, "matching and profile switching must not construct RegExp instances");
  assert.ok(compiled.every((regex) => regex.lastIndex === 0));
  assert.match(send("match", { profile: "unknown", text: "#123" }).error, /rules/);
  const invalid = structuredClone(config);
  invalid.rules.push({ ...invalid.rules[0], id: "empty", pattern: "^", captures: {} });
  assert.match(send("configure", { config: invalid }).error, /zero-length/);
  const afterFailure = compiled.length;
  assert.deepEqual(send("match", { profile: "player", text: "#123:look" }).result, result.result);
  assert.equal(compiled.length, afterFailure, "failed configuration must retain the old compiled registry");
  const reloaded = structuredClone(config);
  reloaded.rules[0].pattern = "(?<object>#[0-9]+):(?<verb>run)";
  reloaded.profiles.pop();
  assert.equal(send("configure", { config: reloaded }).result, true);
  assert.equal(compiled.length, afterFailure + 3);
  assert.equal(send("match", { profile: "player", text: "#123:look" }).result[0].rule, "object");
  assert.equal(send("match", { profile: "player", text: "#123:run" }).result[0].rule, "verb");
  assert.match(send("match", { profile: "objects", text: "#123" }).error, /rules/);
  assert.equal(compiled.length, afterFailure + 3);
});

test("real output parser and menu events target ANSI spans, execute one command, and retain native fallbacks", async (t) => {
  const { createOutputApp } = await import("../../test-support/output-app.js");
  const app = await createOutputApp(t);
  const { client, doc, win, feed } = app;
  const sends = [];
  let copied;
  Object.defineProperty(win.navigator, "clipboard", { value: { async writeText(text) { copied = text; } } });
  client.socketState = 1;
  client.socket = { emit: (...args) => sends.push(args) };
  const controller = setupContextMenus({ client, doc, win, matcherFactory: localMatcher });
  t.after(() => controller.destroy());
  await controller.ready;
  const config = referenceContextMenus();
  config.rules[0].actions.push({ id: "list", label: "List verb", type: "game-command", template: "@list ${object}:${verb}" });
  config.profiles.push({ ...config.profiles[0], id: "staff", label: "Programmer" });
  await controller.reload(JSON.stringify(config));
  await feed("#$# SDWC%%CONTEXT-PROFILE%%\"staff\"\n#12\u001b[31m3:look\u001b[0m plain\n");
  assert.equal(controller.active().profile.id, "staff");
  const row = doc.querySelector("[data-output-id]");
  let textNode = row.querySelector(".all-copy").firstChild;
  doc.caretPositionFromPoint = () => ({ offsetNode: textNode, offset: 0 });
  const originalRange = doc.createRange.bind(doc);
  doc.createRange = () => { const range = originalRange(); range.getClientRects = () => [{ left: 10, right: 20, top: 10, bottom: 20 }]; return range; };
  const contextClick = () => {
    const event = new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 15, clientY: 15 });
    row.dispatchEvent(event);
    return event;
  };
  await new Promise((resolve) => setTimeout(resolve, 30));
  row.dispatchEvent(new win.MouseEvent("pointerdown", { button: 2, bubbles: true }));
  doc.getSelection().selectAllChildren(textNode.parentElement);
  assert.equal(contextClick().defaultPrevented, true);
  assert.deepEqual([...doc.querySelectorAll("[role=menuitem]")].map((item) => item.textContent), ["Copy to Clipboard", "List verb"]);
  assert.deepEqual(sends, []);
  doc.querySelector("[role=menuitem]").click();
  assert.equal(copied, "#123:look");
  contextClick();
  [...doc.querySelectorAll("[role=menuitem]")].find((item) => item.textContent === "List verb").click();
  assert.deepEqual(sends, [["input", "@list #123:look"]]);

  const projection = projectOutputRow(row);
  const followingOffset = "#123:look".length;
  assert.equal(projection.text[followingOffset], " ");
  const following = projection.nodes.find(({ start, end }) => start <= followingOffset && followingOffset < end);
  doc.caretPositionFromPoint = () => ({ offsetNode: following.node, offset: followingOffset - following.start });
  assert.equal(contextClick().defaultPrevented, false, "a click just after the reference remains native");
  assert.equal(doc.querySelector("[role=menu]"), null);
  doc.caretPositionFromPoint = () => ({ offsetNode: textNode, offset: 0 });

  // Markup can replace a text node without changing the match offsets.
  const replacement = textNode.cloneNode();
  textNode.replaceWith(replacement);
  textNode = replacement;
  assert.equal(contextClick().defaultPrevented, true, "hit-test uses the live text nodes before the cache refresh");
  doc.querySelector("[role=menuitem]").click();
  assert.equal(copied, "#123:look");
  const originalText = textNode.data;
  textNode.data = "#98";
  assert.equal(contextClick().defaultPrevented, false, "changed text must wait for a new match");
  assert.equal(doc.querySelector("[role=menu]"), null);
  textNode.data = originalText;

  const blank = new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 100 });
  row.dispatchEvent(blank);
  assert.equal(blank.defaultPrevented, false);
  const bypass = new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, shiftKey: true });
  row.dispatchEvent(bypass);
  assert.equal(bypass.defaultPrevented, false);
  row.focus();
  const keyboard = new win.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true });
  row.dispatchEvent(keyboard);
  assert.equal(keyboard.defaultPrevented, true);
  const popup = doc.querySelector("[role=menu]");
  popup.dispatchEvent(new win.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
  assert.equal(doc.activeElement.textContent, "List verb");
  popup.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(doc.querySelector("[role=menu]"), null);
  assert.equal(doc.activeElement, row);
  await feed("#$# SDWC%%CONTEXT-RESET\n#$# SDWC%%CONTEXT-PROFILE%%\"staff\"\n");
  assert.equal(controller.active().profile.id, "staff");
  client.parseSocketData("#$# SDWC%%CONTEXT-PROFILE%%\"staff\"\n");
  client.resetOutputStream();
  controller.resetSession();
  await app.manager.idle();
  assert.equal(controller.active().source, "Fallback", "queued old-connection OOB must not reactivate staff");
});

test("switching profiles preserves prepared selected output for the first context-menu event", async (t) => {
  const { createOutputApp } = await import("../../test-support/output-app.js");
  const { client, doc, win, feed } = await createOutputApp(t);
  Object.defineProperty(win.navigator, "clipboard", { configurable: true, value: { async writeText() {} } });
  client.openIDE = () => {};
  const controller = setupContextMenus({ client, doc, win, matcherFactory: localMatcher });
  t.after(() => controller.destroy());
  await controller.ready;
  const config = referenceContextMenus();
  config.profiles.push({ ...config.profiles[0], id: "gm", label: "GM" });
  await controller.reload(JSON.stringify(config));
  await feed("Existing #123\n");
  const row = doc.querySelector("[data-output-id]");
  doc.getSelection().selectAllChildren(row);
  doc.dispatchEvent(new win.Event("selectionchange"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  for (const profile of ["gm", "player", "gm"]) {
    controller.update({ override: true, profile });
    const event = new win.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true });
    row.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, "profile switches must not discard already prepared selected text");
    assert.deepEqual([...doc.querySelectorAll("[role=menuitem]")].map((item) => item.textContent), ["Copy selected text", "Open in Scratchpad"]);
    doc.querySelector("[role=menu]").dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  }
  controller.resetSession();
  const stale = new win.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true });
  row.dispatchEvent(stale);
  assert.equal(stale.defaultPrevented, false, "a new session must prepare selection text again");
});

test("selected output uses Copy and Scratchpad rather than token command templates", async (t) => {
  const { createOutputApp } = await import("../../test-support/output-app.js");
  const { client, doc, win, feed } = await createOutputApp(t);
  let copied;
  const scratches = [];
  Object.defineProperty(win.navigator, "clipboard", { configurable: true, value: { async writeText(text) { copied = text; } } });
  client.openIDE = (editor) => scratches.push(editor);
  const controller = setupContextMenus({ client, doc, win, matcherFactory: localMatcher });
  t.after(() => controller.destroy());
  await controller.ready;
  await controller.reload(JSON.stringify(referenceContextMenus()));
  await feed("[host=example.com] #123\n@quit\n");
  const rows = doc.querySelectorAll("[data-output-id]");
  rows[1].focus();
  const selection = doc.getSelection();
  selection.setBaseAndExtent(rows[0], 0, rows[1], rows[1].childNodes.length);
  doc.dispatchEvent(new win.Event("selectionchange"));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(selection.isCollapsed, false);
  rows[1].dispatchEvent(new win.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }));
  assert.deepEqual([...doc.querySelectorAll("[role=menuitem]")].map((item) => item.textContent), ["Copy selected text", "Open in Scratchpad"]);
  doc.querySelector("[role=menuitem]").click();
  assert.equal(copied, "example.com #123\n@quit");
  assert.equal(selection.isCollapsed, false, "Copy must retain the output selection");
  await new Promise((resolve) => setTimeout(resolve, 30));
  rows[1].dispatchEvent(new win.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }));
  [...doc.querySelectorAll("[role=menuitem]")].find((item) => item.textContent === "Open in Scratchpad").click();
  assert.deepEqual(scratches, [{ contextScratch: true, buffer: copied }]);
  Object.defineProperty(win.navigator, "clipboard", { get() { throw new Error("Clipboard unavailable"); } });
  const nativeMenu = new win.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true });
  rows[1].dispatchEvent(nativeMenu);
  assert.equal(nativeMenu.defaultPrevented, false);
  assert.equal(doc.querySelector("[role=menu]"), null);
});

test("legacy output parser also supports ANSI-aware keyboard context menus", async (t) => {
  const { setupOutputParser } = await import("../../src/client/features/terminal/output-buffer.js");
  const { window: win } = new JSDOM("<div id='lineBuffer' tabindex='0'></div>", { url: "https://example.com" });
  const doc = win.document;
  Object.defineProperty(win.navigator, "clipboard", { value: { writeText() {} } });
  const client = { buffer: doc.querySelector("#lineBuffer"), preferences: { performanceBuffer: 0 }, alert: { active: false }, parseYouTubeID() {}, scrollBuffer() {} };
  setupOutputParser({ client, win, logger: { warn() {} } });
  const controller = setupContextMenus({ client, doc, win, matcherFactory: localMatcher });
  t.after(() => { controller.destroy(); win.close(); });
  await controller.ready;
  await controller.reload(JSON.stringify(referenceContextMenus()));
  client.parseSocketData("#12\u001b[31m3.name\u001b[0m\n");
  await new Promise((resolve) => setTimeout(resolve, 30));
  const row = client.buffer.firstElementChild;
  row.dispatchEvent(new win.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(doc.querySelector("[role=menuitem]").textContent, "Copy to Clipboard");
});

test("secondary pop-out and redock retain keyboard menus with one current host binding", async (t) => {
  const { createOutputApp } = await import("../../test-support/output-app.js");
  const { client, doc, win, feed, manager } = await createOutputApp(t);
  const enableHighlights = (host) => {
    host.Highlight = Set;
    host.CSS = { highlights: new Map() };
  };
  enableHighlights(win);

  // The underline is published after the row's matches are ready for the first keypress.
  const matchedRow = async (host, selector) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const row = host.document.querySelector(selector);
      const ranges = host.CSS.highlights.get(CONTEXT_UNDERLINE) || [];
      if (row && [...ranges].some(range => row.contains(range.startContainer))) return row;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail("The mounted output row did not receive its context match");
  };
  const controller = setupContextMenus({ client, doc, win, matcherFactory: localMatcher });
  t.after(() => controller.destroy());
  await controller.ready;
  await controller.reload(JSON.stringify(referenceContextMenus()));
  controller.update({ underline: true });
  const html = await ejs.renderFile("views/output-window.ejs", {});
  const { window: popup } = new JSDOM(html, { url: "https://example.com/output-window/", pretendToBeVisual: true });
  enableHighlights(popup);
  let copied;
  Object.defineProperty(popup.navigator, "clipboard", { value: { async writeText(text) { copied = text; } } });
  Object.defineProperty(win.navigator, "clipboard", { value: { async writeText(text) { copied = text; } } });
  let request;
  popup.focus = win.focus = () => {};
  const originalClose = popup.close.bind(popup);
  popup.close = () => {};
  t.after(originalClose);
  win.open = (url) => { request = url; return popup; };
  manager.updateSettings({ open: true, selected: ["team-chat"] });
  await feed("[-][Team-Chat] #123\n");
  manager.popout.open();
  win.dispatchEvent(new win.MessageEvent("message", { source: popup, origin: win.location.origin, data: { type: "output-popout-ready", instance: new URL(request, win.location.href).hash.slice("#instance=".length) } }));
  const row = await matchedRow(popup, "[data-output-id]");
  row.dispatchEvent(new popup.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }));
  popup.document.querySelector("[role=menuitem]").click();
  assert.equal(copied, "#123");
  manager.popout.redock({ focus: false });
  const docked = await matchedRow(win, "#secondaryBuffer [data-output-id]");
  assert.equal(popup.document.querySelector("[role=menu]"), null);
  docked.dispatchEvent(new win.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(doc.querySelectorAll("[role=menuitem]").length, 1);
});

test("worker responses, errors and superseded reloads preserve snapshot boundaries", async (t) => {
  const handlers = {};
  const worker = { addEventListener: (name, handler) => { handlers[name] = handler; }, postMessage(message) { queueMicrotask(() => handlers.message({ data: { id: message.id, result: true } })); }, terminate() {} };
  const matcher = createContextMatcher({ workerFactory: () => worker });
  assert.equal(await matcher.request("configure", {}), true);
  worker.postMessage = (message) => queueMicrotask(() => handlers.message({ data: { id: message.id, error: "invalid configuration" } }));
  await assert.rejects(matcher.request("configure", {}), /invalid/);
  worker.postMessage = () => queueMicrotask(() => handlers.error());
  await assert.rejects(matcher.request("match", {}), /failed/);
  matcher.destroy();
  const { window: win } = new JSDOM("<p id='context-menu-error'></p>", { url: "https://example.com" });
  let complete;
  let requests = 0;
  const controller = setupContextMenus({ doc: win.document, win, matcherFactory: () => {
    const current = ++requests;
    return { request: () => current === 2 ? new Promise((resolve) => { complete = resolve; }) : Promise.resolve(true), destroy() {} };
  } });
  t.after(() => { controller.destroy(); win.close(); });
  await controller.ready;
  const slow = controller.reload(JSON.stringify(referenceContextMenus()));
  const config = referenceContextMenus();
  config.profiles[0].label = "New label";
  await controller.reload(JSON.stringify(config));
  complete(true);
  assert.equal(await slow, false);
  assert.equal(controller.active().profile.label, "New label");
});

test("JSON import uses the real file control and failed edits keep the last persisted registry", async (t) => {
  const { controller, doc, window: win } = await fixture(t);
  const file = doc.querySelector("#context-menu-file");
  const config = referenceContextMenus();
  config.profiles.push({ ...config.profiles[0], id: "personal", label: "Personal" });
  Object.defineProperty(file, "files", { configurable: true, value: [{ size: 1000, async text() { return JSON.stringify(config); } }] });
  file.dispatchEvent(new win.Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(controller.snapshot.profiles.has("personal"));
  controller.update({ override: true, profile: "personal" });
  const restarted = setupContextMenus({ client: {}, doc, win, matcherFactory: localMatcher });
  await restarted.ready;
  assert.equal(restarted.active().profile.id, "personal");
  assert.equal(restarted.active().source, "Override");
  restarted.destroy();
  const persisted = win.localStorage.getItem(CONTEXT_MENUS_KEY);
  Object.defineProperty(file, "files", { configurable: true, value: [{ size: 1, async text() { return "{"; } }] });
  file.dispatchEvent(new win.Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(win.localStorage.getItem(CONTEXT_MENUS_KEY), persisted);
  assert.equal(controller.active().profile.id, "personal");
  await controller.reload(JSON.stringify(referenceContextMenus()));
  assert.equal(controller.preferences.override, false);
  assert.equal(controller.active().source, "Fallback");
  assert.match(doc.querySelector("#context-menu-error").textContent, /no longer registered/);
});


test("an older JSON file read cannot supersede a newer import, reload or teardown", async (t) => {
  for (const replace of ["file", "read error", "editor", "destroy"]) {
    await t.test(replace, async (t) => {
      const { controller, doc, window: win } = await fixture(t);
      const file = doc.querySelector("#context-menu-file");
      const editor = doc.querySelector("#context-menu-json");
      const original = win.localStorage.getItem(CONTEXT_MENUS_KEY);
      const previous = referenceContextMenus();
      previous.profiles[0].label = "Older import";
      const next = referenceContextMenus();
      next.profiles[0].label = "Latest rules";
      const slow = Promise.withResolvers();
      const choose = (text) => {
        Object.defineProperty(file, "files", { configurable: true, value: [{ size: 1000, text }] });
        file.dispatchEvent(new win.Event("change"));
      };

      choose(() => slow.promise);
      if (replace === "file" || replace === "read error") choose(async () => JSON.stringify(next));
      if (replace === "editor") {
        editor.value = JSON.stringify(next);
        doc.querySelector("#context-menu-reload").click();
      }
      if (replace === "destroy") controller.destroy();
      await new Promise((resolve) => setImmediate(resolve));
      const expected = replace === "destroy" ? original : JSON.stringify(next);
      const draft = editor.value;
      assert.equal(win.localStorage.getItem(CONTEXT_MENUS_KEY), expected);

      if (replace === "read error") slow.reject(new Error("Canceled older read"));
      else slow.resolve(JSON.stringify(previous));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(editor.value, draft);
      assert.equal(win.localStorage.getItem(CONTEXT_MENUS_KEY), expected);
      assert.equal(doc.querySelector("#context-menu-error").textContent, "");
      if (replace !== "destroy") assert.equal(controller.active().profile.label, "Latest rules");
    });
  }
});

test("local rules and override remain usable for the session when storage is read-only", async (t) => {
  const { controller, doc, window } = await fixture(t);
  const saved = window.localStorage.getItem(CONTEXT_MENUS_KEY);
  t.mock.method(window.Storage.prototype, "setItem", () => {
    throw new window.DOMException("Fixture storage is read-only", "QuotaExceededError");
  });
  const config = referenceContextMenus();
  config.profiles.push({ ...config.profiles[0], id: "session-tools", label: "Session tools" });

  assert.equal(await controller.reload(JSON.stringify(config)), true);
  assert.ok(controller.snapshot.profiles.has("session-tools"));
  assert.match(doc.querySelector("#context-menu-error").textContent, /Rules loaded for this session/);
  assert.equal(window.localStorage.getItem(CONTEXT_MENUS_KEY), saved);

  const override = doc.querySelector("#context-menu-override");
  const dropdown = doc.querySelector("#context-menu-profile");
  override.click();
  dropdown.value = "session-tools";
  dropdown.dispatchEvent(new window.Event("change"));
  assert.equal(doc.querySelector("#context-menu-active").textContent, "Active Profile: Session tools (Override)");
  assert.match(doc.querySelector("#context-menu-error").textContent, /preferences could not be saved/);
  assert.equal(window.localStorage.getItem(CONTEXT_MENUS_KEY + "-preferences"), null);
});

test("the file control preserves the current configuration and reports a failed read", async (t) => {
  const { controller, doc, window } = await fixture(t);
  const before = controller.snapshot;
  const editor = doc.querySelector("#context-menu-json");
  const draft = editor.value;
  const file = doc.querySelector("#context-menu-file");
  const error = doc.querySelector("#context-menu-error");

  file.dispatchEvent(new window.Event("change"));
  assert.equal(error.textContent, "");
  Object.defineProperty(file, "files", {
    value: [{ size: 1000, async text() { throw new Error("File is no longer readable"); } }]
  });
  file.dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(error.textContent, /File is no longer readable.*Previous valid/);
  assert.equal(editor.value, draft);
  assert.equal(controller.snapshot, before);
});

test("the JSON editor and file control accept exactly 256 KiB", async (t) => {
  const { controller, doc, window } = await fixture(t);
  const config = referenceContextMenus();
  const limit = 262144;
  config.profiles[0].label = "Editor limit";
  assert.equal(await controller.reload(JSON.stringify(config).padEnd(limit)), true);
  assert.equal(controller.active().profile.label, "Editor limit");

  config.profiles[0].label = "File limit";
  const content = JSON.stringify(config).padEnd(limit);
  const file = doc.querySelector("#context-menu-file");
  Object.defineProperty(file, "files", { value: [{ size: limit, async text() { return content; } }] });
  file.dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.active().profile.label, "File limit");
  assert.equal(doc.querySelector("#context-menu-error").textContent, "");
});

test("an invalid saved draft cannot start a fallback over a newer manual reload", async (t) => {
  const { window: win } = new JSDOM("<p id='context-menu-error'></p>", { url: "https://example.com" });
  win.localStorage.setItem(CONTEXT_MENUS_KEY, "{");
  const controller = setupContextMenus({ doc: win.document, win, matcherFactory: localMatcher });
  t.after(() => { controller.destroy(); win.close(); });

  const config = referenceContextMenus();
  config.profiles[0].label = "Corrected draft";
  const manual = controller.reload(JSON.stringify(config));
  await controller.ready;
  assert.equal(await manual, true);
  assert.equal(controller.revision, 1);
  assert.equal(controller.active().profile.label, "Corrected draft");
  assert.equal(win.document.querySelector("#context-menu-error").textContent, "");
});

test("oversized JSON editor values and files leave the last context-menu snapshot active", async (t) => {
  const { controller, doc, window } = await fixture(t);
  const before = controller.snapshot;
  const oversized = " ".repeat(262144) + JSON.stringify(controller.config);
  assert.equal(await controller.reload(oversized), false);
  const error = doc.querySelector("#context-menu-error");
  assert.match(error.textContent, /exceeds 256 KiB/);
  assert.equal(controller.snapshot, before);

  const file = doc.querySelector("#context-menu-file");
  const text = t.mock.fn(async () => JSON.stringify(controller.config));
  Object.defineProperty(file, "files", { value: [{ size: 262145, text }] });
  file.dispatchEvent(new window.Event("change"));
  assert.equal(text.mock.callCount(), 0);
  assert.match(error.textContent, /exceeds 256 KiB/);
  assert.equal(controller.snapshot, before);
});

test("output matching drains a burst beyond the worker queue cap without dropping unchanged rows", async (t) => {
  const { controller, doc, window, client } = await fixture(t);
  Object.defineProperty(window.navigator, "clipboard", { value: { async writeText() {} } });
  const output = doc.createElement("div");
  const rows = Array.from({ length: 300 }, (_, index) => {
    const row = doc.createElement("div");
    row.textContent = "Row " + index + " #123";
    output.append(row);
    return row;
  });
  doc.body.append(output);
  let count = 0;
  let active = 0;
  let maximum = 0;
  const handlers = {};
  let snapshot;
  const matcher = createContextMatcher({ workerFactory: () => ({
    addEventListener(type, handler) { handlers[type] = handler; },
    postMessage(data) {
      active++;
      maximum = Math.max(maximum, active);
      queueMicrotask(() => {
        let result;
        if (data.type === "configure") { snapshot = validateContextMenus(data.config); result = true; }
        else {
          count++;
          result = matchContextRules(data.text, snapshot.profiles.get(data.profile).rules.map((id) => snapshot.rules.get(id)));
        }
        active--;
        handlers.message({ data: { id: data.id, result } });
      });
    },
    terminate() {}
  }) });
  await matcher.request("configure", { config: controller.config });
  controller.match = (text) => matcher.request("match", { text, profile: controller.active().profile.id });
  t.after(() => matcher.destroy());
  controller.bindOutput(output, window);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(count, 300);
  assert.equal(maximum, 1);
  for (const row of [rows[0], rows.at(-1)]) {
    const event = new window.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true });
    row.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    doc.querySelector("[role=menuitem]").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  output.append(doc.createComment("unchanged rows"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(count, 300, "completed matches must still be reused");
  assert.equal(doc.querySelector("#context-menu-error").textContent, "");
  assert.equal(client.socketState, 1);
});

test("temporary worker saturation retries unchanged output but terminal failures keep native menus", { timeout: 5000 }, async (t) => {
  const { controller, doc, window } = await fixture(t);
  Object.defineProperty(window.navigator, "clipboard", { value: { async writeText() {} } });
  const output = doc.createElement("div");
  const row = doc.createElement("div");
  row.textContent = "#123";
  output.append(row);
  doc.body.append(output);
  const match = controller.match.bind(controller);
  const timer = t.mock.method(window, "setTimeout");
  const retryCount = () => timer.mock.calls.filter(call => call.arguments[1] === 25).length;
  const { promise: retried, resolve: retryMatched } = Promise.withResolvers();
  let calls = 0;
  controller.match = async (text) => {
    if (++calls === 1) return Promise.reject(Object.assign(new Error("busy"), { code: "CONTEXT_MATCHER_BUSY" }));
    const matches = await match(text);
    retryMatched();
    return matches;
  };
  controller.bindOutput(output, window);
  await retried;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  const event = new window.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true });
  row.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(doc.querySelector("#context-menu-error").textContent, "");
  doc.querySelector("[role=menuitem]").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const originalRetryCount = retryCount();
  const { promise: rejected, resolve: terminalMatch } = Promise.withResolvers();
  controller.match = () => {
    calls++;
    terminalMatch();
    return Promise.reject(new Error("timed out"));
  };
  row.textContent = "#456";
  await rejected;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 3);
  assert.equal(retryCount(), originalRetryCount, "terminal worker failures must not schedule a retry");
  const native = new window.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true });
  row.dispatchEvent(native);
  assert.equal(native.defaultPrevented, false);
});


test("queued output removed and reattached before matching is not stranded in a pending cache entry", async (t) => {
  const { controller, doc, window } = await fixture(t);
  const output = doc.createElement("div");
  const first = doc.createElement("div");
  const second = doc.createElement("div");
  first.textContent = "First #123";
  second.textContent = "Second #456";
  output.append(first, second);
  doc.body.append(output);
  const match = controller.match.bind(controller);
  const calls = [];
  let release;
  controller.match = (text) => {
    calls.push(text);
    if (text === first.textContent) return new Promise((resolve) => { release = async () => resolve(await match(text)); });
    return match(text);
  };
  controller.bindOutput(output, window);
  await new Promise((resolve) => setTimeout(resolve, 10));
  second.remove();
  await new Promise((resolve) => setTimeout(resolve, 10));
  output.append(second);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, ["First #123", "Second #456"]);
});

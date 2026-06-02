import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_OPTION_DEFINITIONS,
  CLIENT_OPTION_LABELS,
  buildClientOptionState,
  buildPreferenceDefaults
} from "../../src/client/client-option-schema.js";
import {
  parseClientOptionCommandIntent,
  readClientPreferences,
  translateClientOptionName,
  validateClientOptionValue
} from "../../src/client/client-option-parser.js";

test("readClientPreferences merges defaults, stored values, and valid URL params", () => {
  const stored = new Map([
    ["dc-toggle-colorset", "snow"],
    ["dc-toggle-outfont", "lucida"]
  ]);

  const result = readClientPreferences({
    locationSearch: "?cl=acid&oz=12&pb=0&if=menlo",
    getStoredValue: (key) => stored.get(key) ?? null
  });

  assert.equal(result.preferences.colorSet, "acid");
  assert.equal(result.preferences.lineBufferFont, "lucida");
  assert.equal(result.preferences.lineBufferFontSizePt, 12);
  assert.equal(result.preferences.performanceBuffer, 0);
  assert.equal(result.preferences.inputFont, "menlo");
  assert.deepEqual(result.persistenceUpdates, [
    { key: "dc-toggle-editorfont", value: "lucida" }
  ]);
});

test("readClientPreferences ignores invalid URL params and disabled shortening persists off", () => {
  const result = readClientPreferences({
    locationSearch: "?cl=nope&oz=100&ef=menlo&su=true",
    shortenFeatureEnabled: false
  });

  assert.equal(result.preferences.colorSet, "normal");
  assert.equal(result.preferences.lineBufferFontSizePt, 9.75);
  assert.equal(result.preferences.editorFont, "menlo");
  assert.equal(result.preferences.shortenUrls, false);
  assert.deepEqual(result.persistenceUpdates, [
    { key: "dc-toggle-shorten", value: false }
  ]);
});

test("client option command parser returns command intent without side effects", () => {
  assert.deepEqual(parseClientOptionCommandIntent("@client-options"), { type: "list" });
  assert.deepEqual(parseClientOptionCommandIntent("@client-option"), { type: "help" });
  assert.deepEqual(parseClientOptionCommandIntent("@client-option cl"), {
    type: "read",
    optionName: "colorSet"
  });
  assert.deepEqual(parseClientOptionCommandIntent("@client-option localEcho true"), {
    type: "write",
    optionName: "localEcho",
    value: "true"
  });
});

test("translateClientOptionName supports params, preference names, and unknowns", () => {
  assert.equal(translateClientOptionName("cl"), "colorSet");
  assert.equal(translateClientOptionName("colorSet"), "colorSet");
  assert.equal(translateClientOptionName("nope"), "nope");
});

test("validateClientOptionValue coerces valid values and reports invalid input", () => {
  const valid = validateClientOptionValue("localEcho", "true");
  assert.equal(valid.valid, true);
  assert.equal(valid.value, true);
  assert.equal(valid.optionDef.key, "localecho");
  assert.equal(valid.optionDef.label, "Enable Local Echo");

  assert.equal(validateClientOptionValue("lineBufferFontSizePt", "100").error, "Invalid @client-option value, must be between 8 and 24\n");
  assert.equal(validateClientOptionValue("inputFontColor", "bad").error, "Invalid @client-option value, must be a hex color like #AABBCC\n");
  assert.equal(validateClientOptionValue("performanceBuffer", "abc").error, "Invalid @client-option value, must be a number\n");
  assert.equal(validateClientOptionValue("colorSet", "nope").error, "Invalid @client-option value, must be one of normal,dim,slither,acid,corpie,snow\n");
});

test("client option schema includes labels for every option surface", () => {
  const defaults = buildPreferenceDefaults();
  const optionState = buildClientOptionState();

  CLIENT_OPTION_DEFINITIONS.forEach((option) => {
    assert.equal(typeof option.label, "string");
    assert.notEqual(option.label.trim(), "");
    assert.equal(CLIENT_OPTION_LABELS[option.key], option.label);
    assert.equal(optionState[option.key].label, option.label);
    assert.ok(Object.prototype.hasOwnProperty.call(defaults, option.preferenceName));
  });
});

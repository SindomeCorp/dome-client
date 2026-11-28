import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_OPTION_DEFINITIONS,
  CLIENT_OPTION_LABELS,
  CLIENT_OPTION_VIEW,
  buildClientOptionState,
  buildPreferenceDefaults,
  getClientOptionStorageKey,
  getOutputPresentation,
  getPreferenceNameForOptionKey
} from "../../src/shared/client-options.js";
import {
  parseClientOptionCommandIntent,
  readClientPreferences,
  translateClientOptionName,
  validateClientOptionValue
} from "../../src/client/features/options/client-option-parser.js";

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
    { key: "dc-toggle-secondarycolorset", value: "acid" },
    { key: "dc-toggle-secondaryoutfont", value: "lucida" },
    { key: "dc-toggle-secondaryoutfontsize", value: 12 },
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
    { key: "dc-toggle-secondarycolorset", value: "normal" },
    { key: "dc-toggle-secondaryoutfont", value: "standard" },
    { key: "dc-toggle-secondaryoutfontsize", value: 9.75 },
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
    assert.equal(CLIENT_OPTION_VIEW[option.key].label, option.label);
    assert.equal(optionState[option.key].label, option.label);
    assert.ok(Object.prototype.hasOwnProperty.call(defaults, option.preferenceName));
  });
});

test("general client options expose help tooltips", () => {
  CLIENT_OPTION_DEFINITIONS
    .filter((option) => option.group === "general")
    .forEach((option) => {
      assert.equal(typeof option.tooltip, "string", `${option.key} is missing a tooltip`);
      assert.notEqual(option.tooltip.trim(), "", `${option.key} has an empty tooltip`);
      assert.equal(CLIENT_OPTION_VIEW[option.key].tooltip, option.tooltip);
    });
});

test("client option schema owns localStorage keys", () => {
  assert.equal(getClientOptionStorageKey("colorset"), "dc-toggle-colorset");
  assert.equal(getClientOptionStorageKey("colorset", "custom-"), "custom-colorset");
});

test("client option schema maps rendered option keys to preference names", () => {
  const optionState = buildClientOptionState();

  assert.equal(getPreferenceNameForOptionKey("colorset"), "colorSet");
  assert.equal(optionState.colorset.preferenceName, "colorSet");
  assert.equal(getPreferenceNameForOptionKey("unknown"), null);
});

test("client option schema exposes view choices for rendered select controls", () => {
  const optionState = buildClientOptionState();

  ["scroll", "edittheme", "edittype", "colorset", "outfont", "inputfont", "editorfont"].forEach((key) => {
    assert.ok(Array.isArray(CLIENT_OPTION_VIEW[key].choices));
    assert.ok(CLIENT_OPTION_VIEW[key].choices.length > 0);
    assert.deepEqual(optionState[key].choices, CLIENT_OPTION_VIEW[key].choices);
  });
});

test("output presentation preserves independent styles and includes both size boundaries", () => {
  const preferences = {
    lineBufferFont: "lucida", colorSet: "acid", lineBufferFontSizePt: "8",
    secondaryLineBufferFont: "menlo", secondaryColorSet: "snow", secondaryLineBufferFontSizePt: 24
  };
  assert.deepEqual(getOutputPresentation(preferences), { font: "lucida", theme: "acid", size: 8 });
  assert.deepEqual(getOutputPresentation(preferences, true), { font: "menlo", theme: "snow", size: 24 });
  assert.deepEqual(getOutputPresentation(), { font: "standard", theme: "normal", size: 9.75 });
  for (const size of [7.99, 24.01, Infinity, "not a size"]) {
    assert.deepEqual(
      getOutputPresentation({ ...preferences, secondaryLineBufferFont: "invalid", secondaryColorSet: "invalid", secondaryLineBufferFontSizePt: size }, true),
      { font: "standard", theme: "normal", size: 9.75 }
    );
  }
});

test("typed option validation normalizes color and preserves exact numeric endpoint values", () => {
  for (const spelling of ["abc123", "  #aBc123  "]) {
    const color = validateClientOptionValue("inputFontColor", spelling);
    assert.equal(color.valid, true);
    assert.equal(color.value, "#ABC123");
  }
  for (const color of [null, 123456, "#ABC", "#ABC12300", "#ABC12Z"]) {
    assert.equal(validateClientOptionValue("inputFontColor", color).valid, false);
  }
  for (const [input, expected] of [["8", 8], ["24", 24]]) {
    const result = validateClientOptionValue("lineBufferFontSizePt", input);
    assert.equal(result.valid, true);
    assert.equal(result.value, expected);
  }
  assert.equal(validateClientOptionValue("lineBufferFontSizePt", "7.99").valid, false);
  assert.equal(validateClientOptionValue("lineBufferFontSizePt", "24.01").valid, false);
});

export const EDIT_THEMES = ["ambience", "chaos", "chrome", "clouds", "clouds_midnight", "cobalt", "crimson_editor", "dawn", "dreamweaver", "eclipse", "github", "idle_fingers", "kr_theme", "merbivore", "merbivore_soft", "mono_industrial", "monokai", "pastel_on_dark", "solarized_dark", "solarized_light", "terminal", "textmate", "tomorrow_night", "tomorrow_night_blue", "tomorrow_night_bright", "tomorrow_night_eighties", "twilight", "vibrant_ink", "xcode"];

export const FONT_CHOICES = [
  "standard",
  "lucida",
  "courier",
  "roboto",
  "comic-mono",
  "monaco",
  "menlo",
  "ubuntu-mono",
  "consolas",
];

export const COLORSET_CHOICES = ["normal", "dim", "slither", "acid", "corpie", "snow"];

export const CLIENT_OPTION_DEFINITIONS = [
  { key: "commands", param: "cs", preferenceName: "commandSuggestions", def: true, ok: [true, false] },
  { key: "shorten", param: "su", preferenceName: "shortenUrls", def: true, ok: [true, false] },
  { key: "scroll", param: "as", preferenceName: "autoScroll", def: "dbl", ok: ["dbl", "long", "none"] },
  { key: "edittheme", param: "et", preferenceName: "edittheme", def: "twilight", ok: EDIT_THEMES },
  { key: "edittype", param: "ed", preferenceName: "editorType", def: "ide", ok: ["ide", "windows"] },
  { key: "colorset", param: "cl", preferenceName: "colorSet", def: "normal", ok: COLORSET_CHOICES },
  { key: "outfont", param: "of", preferenceName: "lineBufferFont", def: "standard", ok: FONT_CHOICES },
  { key: "outfontsize", param: "oz", preferenceName: "lineBufferFontSizePt", def: 9.75, min: 8, max: 24 },
  { key: "inputfont", param: "if", preferenceName: "inputFont", def: "standard", ok: FONT_CHOICES },
  { key: "inputfontsize", param: "iz", preferenceName: "inputFontSizePt", def: 11, min: 8, max: 24 },
  { key: "inputfontcolor", param: "ic", preferenceName: "inputFontColor", def: "#EEEEEE", type: "color" },
  { key: "inputbgcolor", param: "ib", preferenceName: "inputBackgroundColor", def: "#333333", type: "color" },
  { key: "editorfont", param: "ef", preferenceName: "editorFont", def: "standard", ok: FONT_CHOICES },
  { key: "playding", param: "pd", preferenceName: "playDing", def: true, ok: [true, false] },
  { key: "localecho", param: "le", preferenceName: "localEcho", def: false, ok: [true, false] },
  { key: "imageview", param: "iv", preferenceName: "imagePreview", def: false, ok: [true, false] },
  { key: "logcss", param: "lc", preferenceName: "inlineLogCss", def: true, ok: [true, false] },
  { key: "sdwcnowrap", param: "nw", preferenceName: "sdwcNowrapBlocks", def: false, ok: [true, false] },
  { key: "scrolluppause", param: "up", preferenceName: "scrollUpToPause", def: false, ok: [true, false] },
  { key: "transparent", param: "to", preferenceName: "transparentOverlay", def: true, ok: [true, false] },
  { key: "broadly", param: "bs", preferenceName: "broadSearch", def: true, ok: [true, false] },
  { key: "buffer", param: "pb", preferenceName: "performanceBuffer", def: 0 }
];

export const CLIENT_OPTION_BY_KEY = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.key, option])
);

export const CLIENT_OPTION_BY_PARAM = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.param, option])
);

export const CLIENT_OPTION_BY_PREFERENCE = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.preferenceName, option])
);

export const PREF_NAME = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.key, option.preferenceName])
);

export function buildClientOptionState() {
  return Object.fromEntries(CLIENT_OPTION_DEFINITIONS.map((option) => [
    option.key,
    {
      param: option.param,
      def: option.def,
      ...(option.ok ? { ok: option.ok } : {}),
      ...(option.min != null ? { min: option.min } : {}),
      ...(option.max != null ? { max: option.max } : {}),
      ...(option.type ? { type: option.type } : {})
    }
  ]));
}

export function buildPreferenceDefaults() {
  return Object.fromEntries(
    CLIENT_OPTION_DEFINITIONS.map((option) => [option.preferenceName, option.def])
  );
}

export function normalizeHexColor(value) {
  if (typeof value !== "string") return null;
  let hex = value.trim();
  if (!hex.startsWith("#")) {
    hex = `#${hex}`;
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return hex.toUpperCase();
}

export function coerceOptionValue(option, value) {
  if (!option) return { valid: false, value };

  let nextValue = value;
  if (nextValue === "true") {
    nextValue = true;
  } else if (nextValue === "false") {
    nextValue = false;
  }

  if (option.type === "color") {
    const normalized = normalizeHexColor(nextValue);
    return normalized ? { valid: true, value: normalized } : { valid: false, value: nextValue };
  }

  if (typeof option.def === "number" && typeof nextValue === "string") {
    const num = Number(nextValue);
    if (!Number.isNaN(num)) {
      nextValue = num;
    }
  }

  if (typeof option.def === "number") {
    if (typeof nextValue !== "number" || Number.isNaN(nextValue)) {
      return { valid: false, value: nextValue };
    }
    if (option.min != null && nextValue < option.min) {
      return { valid: false, value: nextValue };
    }
    if (option.max != null && nextValue > option.max) {
      return { valid: false, value: nextValue };
    }
  }

  if (option.ok && !option.ok.includes(nextValue)) {
    return { valid: false, value: nextValue };
  }

  return { valid: true, value: nextValue };
}

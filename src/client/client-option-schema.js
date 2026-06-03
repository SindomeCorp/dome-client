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

const FONT_OPTION_CHOICES = [
  { value: "standard", label: "Source Code Pro", style: "font-family: 'Source Code Pro'" },
  { value: "lucida", label: "Lucida Console", style: "font-family: 'Lucida Console'" },
  { value: "courier", label: "Courier New", style: "font-family: 'Courier New'" },
  { value: "roboto", label: "Roboto Mono", style: "font-family: 'Roboto Mono'" },
  { value: "comic-mono", label: "Comic Mono", style: "font-family: 'Comic Mono'" },
  { value: "monaco", label: "Monaco", style: "font-family: 'Monaco'" },
  { value: "menlo", label: "Menlo", style: "font-family: 'Menlo'" },
  { value: "ubuntu-mono", label: "Ubuntu Mono", style: "font-family: 'Ubuntu Mono'" },
  { value: "consolas", label: "Consolas", style: "font-family: 'Consolas'" },
];

const COLORSET_OPTION_CHOICES = [
  { value: "normal", label: "Normal Colors" },
  { value: "dim", label: "Not So Bright" },
  { value: "slither", label: "Switch Bright White/Green" },
  { value: "acid", label: "Dystopia is Pretty" },
  { value: "corpie", label: "Privileged Class" },
  { value: "snow", label: "Office Documents" },
];

const SCROLL_TOGGLE_CHOICES = [
  { value: "dbl", label: "Double Click" },
  { value: "long", label: "Long Click" },
  { value: "none", label: "Pause Button Only" },
];

const EDITOR_TYPE_CHOICES = [
  { value: "ide", label: "IDE" },
  { value: "windows", label: "Individual Windows" },
];

const EDIT_THEME_CHOICES = EDIT_THEMES.map((theme) => ({ value: theme, label: theme }));

export const CLIENT_OPTION_DEFINITIONS = [
  { key: "commands", label: "Use Command Hints", param: "cs", preferenceName: "commandSuggestions", def: true, ok: [true, false] },
  { key: "shorten", label: "Shorten Long Web Links", param: "su", preferenceName: "shortenUrls", def: true, ok: [true, false] },
  { key: "scroll", label: "Toggle Scroll & Auto Scroll", param: "as", preferenceName: "autoScroll", def: "dbl", ok: ["dbl", "long", "none"], choices: SCROLL_TOGGLE_CHOICES },
  { key: "edittheme", label: "Editor Theme", param: "et", preferenceName: "edittheme", def: "twilight", ok: EDIT_THEMES, choices: EDIT_THEME_CHOICES },
  { key: "edittype", label: "Editor Type", param: "ed", preferenceName: "editorType", def: "ide", ok: ["ide", "windows"], choices: EDITOR_TYPE_CHOICES },
  { key: "colorset", label: "Theme", param: "cl", preferenceName: "colorSet", def: "normal", ok: COLORSET_CHOICES, choices: COLORSET_OPTION_CHOICES },
  { key: "outfont", label: "Output Font", param: "of", preferenceName: "lineBufferFont", def: "standard", ok: FONT_CHOICES, choices: FONT_OPTION_CHOICES },
  { key: "outfontsize", label: "Output Font Size (pt)", param: "oz", preferenceName: "lineBufferFontSizePt", def: 9.75, min: 8, max: 24 },
  { key: "inputfont", label: "Input Font", param: "if", preferenceName: "inputFont", def: "standard", ok: FONT_CHOICES, choices: FONT_OPTION_CHOICES },
  { key: "inputfontsize", label: "Input Font Size (pt)", param: "iz", preferenceName: "inputFontSizePt", def: 11, min: 8, max: 24 },
  { key: "inputfontcolor", label: "Input Font Color", param: "ic", preferenceName: "inputFontColor", def: "#EEEEEE", type: "color" },
  { key: "inputbgcolor", label: "Input Background Color", param: "ib", preferenceName: "inputBackgroundColor", def: "#333333", type: "color" },
  { key: "editorfont", label: "Editor Font", param: "ef", preferenceName: "editorFont", def: "standard", ok: FONT_CHOICES, choices: FONT_OPTION_CHOICES },
  { key: "playding", label: "Play Sound on Name", param: "pd", preferenceName: "playDing", def: true, ok: [true, false] },
  { key: "localecho", label: "Enable Local Echo", param: "le", preferenceName: "localEcho", def: false, ok: [true, false] },
  { key: "imageview", label: "Show Preview of Images", param: "iv", preferenceName: "imagePreview", def: false, ok: [true, false] },
  { key: "logcss", label: "Embed CSS In Saved Logs", param: "lc", preferenceName: "inlineLogCss", def: true, ok: [true, false] },
  { key: "sdwcnowrap", label: "Mobile Friendly Text Wrap", param: "nw", preferenceName: "sdwcNowrapBlocks", def: false, ok: [true, false] },
  { key: "scrolluppause", label: "Scroll Up to Pause", param: "up", preferenceName: "scrollUpToPause", def: false, ok: [true, false] },
  { key: "transparent", label: "Transparent Overlays", param: "to", preferenceName: "transparentOverlay", def: true, ok: [true, false] },
  { key: "broadly", label: "Search Command Help", param: "bs", preferenceName: "broadSearch", def: true, ok: [true, false] },
  { key: "buffer", label: "Scroll Buffer Size", param: "pb", preferenceName: "performanceBuffer", def: 0 }
];

const CLIENT_OPTION_BY_KEY = Object.fromEntries(
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

export const CLIENT_OPTION_LABELS = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.key, option.label])
);

export const CLIENT_OPTION_VIEW = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.key, {
    label: option.label,
    ...(option.choices ? { choices: option.choices } : {})
  }])
);

export function buildClientOptionState() {
  return Object.fromEntries(CLIENT_OPTION_DEFINITIONS.map((option) => [
    option.key,
    {
      param: option.param,
      label: option.label,
      def: option.def,
      ...(option.ok ? { ok: option.ok } : {}),
      ...(option.min != null ? { min: option.min } : {}),
      ...(option.max != null ? { max: option.max } : {}),
      ...(option.type ? { type: option.type } : {}),
      ...(option.choices ? { choices: option.choices } : {})
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

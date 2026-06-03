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
export const CLIENT_OPTION_STORAGE_PREFIX = "dc-toggle-";

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
  { key: "commands", label: "Use Command Hints", param: "cs", preferenceName: "commandSuggestions", def: true, ok: [true, false], group: "general", control: "toggle" },
  { key: "shorten", label: "Shorten Long Web Links", param: "su", preferenceName: "shortenUrls", def: true, ok: [true, false], group: "general", control: "toggle", visibleWhen: "shortenEnabled" },
  { key: "scroll", label: "Toggle Scroll & Auto Scroll", param: "as", preferenceName: "autoScroll", def: "dbl", ok: ["dbl", "long", "none"], choices: SCROLL_TOGGLE_CHOICES, group: "general", control: "select", labelClass: "pull-left", inputName: "auto-scroll-toggle" },
  { key: "edittheme", label: "Editor Theme", param: "et", preferenceName: "edittheme", def: "twilight", ok: EDIT_THEMES, choices: EDIT_THEME_CHOICES, group: "editor", control: "select", inputName: "editor-theme-choice" },
  { key: "edittype", label: "Editor Type", param: "ed", preferenceName: "editorType", def: "ide", ok: ["ide", "windows"], choices: EDITOR_TYPE_CHOICES, group: "editor", control: "select", inputName: "editor-type-choice" },
  { key: "colorset", label: "Theme", param: "cl", preferenceName: "colorSet", def: "normal", ok: COLORSET_CHOICES, choices: COLORSET_OPTION_CHOICES, group: "fonts", control: "select", inputName: "colorset-choice" },
  { key: "outfont", label: "Output Font", param: "of", preferenceName: "lineBufferFont", def: "standard", ok: FONT_CHOICES, choices: FONT_OPTION_CHOICES, group: "fonts", control: "select", inputName: "output-font-choice" },
  { key: "outfontsize", label: "Output Font Size (pt)", param: "oz", preferenceName: "lineBufferFontSizePt", def: 9.75, min: 8, max: 24, group: "fonts", control: "number", inputName: "output-font-size", step: 0.25 },
  { key: "inputfont", label: "Input Font", param: "if", preferenceName: "inputFont", def: "standard", ok: FONT_CHOICES, choices: FONT_OPTION_CHOICES, group: "fonts", control: "select", inputName: "input-font-choice" },
  { key: "inputfontsize", label: "Input Font Size (pt)", param: "iz", preferenceName: "inputFontSizePt", def: 11, min: 8, max: 24, group: "fonts", control: "number", inputName: "input-font-size", step: 0.5 },
  { key: "inputfontcolor", label: "Input Font Color", param: "ic", preferenceName: "inputFontColor", def: "#EEEEEE", type: "color", group: "fonts", control: "color", inputName: "input-font-color" },
  { key: "inputbgcolor", label: "Input Background Color", param: "ib", preferenceName: "inputBackgroundColor", def: "#333333", type: "color", group: "fonts", control: "color", inputName: "input-bg-color" },
  { key: "editorfont", label: "Editor Font", param: "ef", preferenceName: "editorFont", def: "standard", ok: FONT_CHOICES, choices: FONT_OPTION_CHOICES, group: "fonts", control: "select", inputName: "editor-font-choice" },
  { key: "playding", label: "Play Sound on Name", param: "pd", preferenceName: "playDing", def: true, ok: [true, false], group: "general", control: "toggle", enabledTitle: "When the window is out of focus, play a notification sound when your login name is seen in the scrollback." },
  { key: "localecho", label: "Enable Local Echo", param: "le", preferenceName: "localEcho", def: false, ok: [true, false], group: "general", control: "toggle" },
  { key: "imageview", label: "Show Preview of Images", param: "iv", preferenceName: "imagePreview", def: false, ok: [true, false], group: "general", control: "toggle" },
  { key: "logcss", label: "Embed CSS In Saved Logs", param: "lc", preferenceName: "inlineLogCss", def: true, ok: [true, false], group: "general", control: "toggle", enabledTitle: "Default: save logs with inline stylesheet for fully self-contained files.", disabledTitle: "Legacy mode: save logs that link to https://sindome.org/css/dome.css for smaller files." },
  { key: "sdwcnowrap", label: "Mobile Friendly Text Wrap", param: "nw", preferenceName: "sdwcNowrapBlocks", def: false, ok: [true, false], group: "general", control: "toggle", tooltip: "With this option enabled, the client will create non-wrapped content that can be horizontally scrolled for text that the MOO deems should be visually presented as is, and not wrapped on small screens.", enabledTitle: "Render SDWC-START-NOWRAP/SDWC-END-NOWRAP sections in a horizontal-scroll block without text wrapping.", disabledTitle: "Ignore SDWC nowrap markers and keep normal line wrapping." },
  { key: "scrolluppause", label: "Scroll Up to Pause", param: "up", preferenceName: "scrollUpToPause", def: false, ok: [true, false], group: "general", control: "toggle", tooltip: "When enabled, scrolling up in the output buffer pauses automatic scroll-to-bottom so new text does not pull you away from what you are reading. Scroll back to the bottom to resume normal automatic scrolling.", enabledTitle: "Pause automatic scrolling when you scroll up in the output buffer.", disabledTitle: "Keep automatic scrolling behavior controlled only by the pause/resume controls." },
  { key: "transparent", label: "Transparent Overlays", param: "to", preferenceName: "transparentOverlay", def: true, ok: [true, false], group: "general", control: "toggle", enabledTitle: "Make dialogs for autocomplete, help, etc transparent enough to see MOO text underneath.", disabledTitle: "Make dialogs for autocomplete, help, etc opaque. This can be helpful for performance." },
  { key: "broadly", label: "Search Command Help", param: "bs", preferenceName: "broadSearch", def: true, ok: [true, false], group: "general", control: "toggle", enabledTitle: "Search command instructions and requirements when Command Hints are enabled.", disabledTitle: "Just search command syntax when Command Hints are enabled. This can be helpful for performance." },
  { key: "buffer", label: "Scroll Buffer Size", param: "pb", preferenceName: "performanceBuffer", def: 0, min: 0, max: 96000, group: "general", control: "number", inputName: "buffer-size", tooltip: "This defines the length of your buffer. 0 is infinite (best for logging). Adjust this to a lower number if you are having performance issues. Warning: Your current buffer is saved with the 'Log' button, so lower numbers mean a shorter log." }
];

const CLIENT_OPTION_GROUP_ORDER = {
  general: ["localecho", "commands", "buffer", "broadly", "shorten", "imageview", "playding", "scroll", "scrolluppause", "transparent", "logcss", "sdwcnowrap"],
  fonts: ["outfont", "outfontsize", "editorfont", "inputfont", "inputfontsize", "inputfontcolor", "inputbgcolor", "colorset"],
  editor: ["edittype", "edittheme"]
};

const CLIENT_OPTION_BY_KEY = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.key, option])
);

export const CLIENT_OPTION_BY_PARAM = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.param, option])
);

export const CLIENT_OPTION_BY_PREFERENCE = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.preferenceName, option])
);

export const CLIENT_OPTION_LABELS = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.key, option.label])
);

export const CLIENT_OPTION_VIEW = Object.fromEntries(
  CLIENT_OPTION_DEFINITIONS.map((option) => [option.key, {
    label: option.label,
    def: option.def,
    key: option.key,
    group: option.group,
    control: option.control,
    inputName: option.inputName,
    labelClass: option.labelClass,
    visibleWhen: option.visibleWhen,
    tooltip: option.tooltip,
    enabledTitle: option.enabledTitle,
    disabledTitle: option.disabledTitle,
    ...(option.step != null ? { step: option.step } : {}),
    ...(option.min != null ? { min: option.min } : {}),
    ...(option.max != null ? { max: option.max } : {}),
    ...(option.type ? { type: option.type } : {}),
    ...(option.choices ? { choices: option.choices } : {})
  }])
);

export const CLIENT_OPTION_GROUPS = Object.fromEntries(
  Object.entries(CLIENT_OPTION_GROUP_ORDER).map(([group, keys]) => [
    group,
    keys.map((key) => CLIENT_OPTION_VIEW[key]).filter(Boolean)
  ])
);

export function buildClientOptionState() {
  return Object.fromEntries(CLIENT_OPTION_DEFINITIONS.map((option) => [
    option.key,
    {
      param: option.param,
      label: option.label,
      preferenceName: option.preferenceName,
      def: option.def,
      ...(option.ok ? { ok: option.ok } : {}),
      ...(option.min != null ? { min: option.min } : {}),
      ...(option.max != null ? { max: option.max } : {}),
      ...(option.type ? { type: option.type } : {}),
      ...(option.choices ? { choices: option.choices } : {})
    }
  ]));
}

export function getClientOptionDefinitionByKey(optionKey) {
  return CLIENT_OPTION_BY_KEY[optionKey] ?? null;
}

export function getPreferenceNameForOptionKey(optionKey) {
  return getClientOptionDefinitionByKey(optionKey)?.preferenceName ?? null;
}

export function buildPreferenceDefaults() {
  return Object.fromEntries(
    CLIENT_OPTION_DEFINITIONS.map((option) => [option.preferenceName, option.def])
  );
}

export function getClientOptionStorageKey(optionKey, prefix = CLIENT_OPTION_STORAGE_PREFIX) {
  return `${prefix}${optionKey}`;
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

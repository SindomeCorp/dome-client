import {
  FONT_CHOICES,
  normalizeHexColor
} from "./client-option-schema.js";

const INPUT_FONT_FAMILIES = {
  standard: "\"Source Code Pro\"",
  lucida: "\"Lucida Console\"",
  courier: "\"Courier New\"",
  roboto: "\"Roboto Mono\"",
  "comic-mono": "\"Comic Mono\"",
  monaco: "\"Monaco\"",
  menlo: "\"Menlo\"",
  "ubuntu-mono": "\"Ubuntu Mono\"",
  consolas: "\"Consolas\"",
};
const INPUT_FONT_CLASSES = FONT_CHOICES.map((font) => `${font}Text`);

export function createClientPreferenceDomAppliers({
  client,
  doc = globalThis.document
} = {}) {
  const applyTransparentOverlayPreference = function(transparentOverlay = client.preferences?.transparentOverlay) {
    doc.querySelectorAll(".ui-autocomplete").forEach((ac) => {
      setOverlayTransparency(ac, transparentOverlay);
    });

    [
      "#shortcuts-overlay",
      "#history-search-overlay",
      "#client-options-overlay",
      "#gameHealthDetail",
    ].forEach((selector) => {
      const overlay = doc.querySelector(selector);
      if (!overlay) return;
      setOverlayTransparency(overlay, transparentOverlay);
    });
  };

  const applyInputReaderTextPreferences = function() {
    if (!client.inputReader) return;
    const prefFont = client.preferences?.inputFont;
    const fontName = FONT_CHOICES.includes(prefFont) ? prefFont : "standard";
    const prefSize = Number(client.preferences?.inputFontSizePt);
    const fontSizePt = !Number.isNaN(prefSize) && prefSize >= 8 && prefSize <= 24 ? prefSize : 11;
    client.inputReader.classList.remove(...INPUT_FONT_CLASSES);
    client.inputReader.classList.add(`${fontName}Text`);
    client.inputReader.style.fontFamily = INPUT_FONT_FAMILIES[fontName] || INPUT_FONT_FAMILIES.standard;
    client.inputReader.style.fontSize = `${fontSizePt}pt`;
  };

  const applyOutputBufferTextPreferences = function() {
    if (!client.buffer) return;
    const prefSize = Number(client.preferences?.lineBufferFontSizePt);
    const fontSizePt = !Number.isNaN(prefSize) && prefSize >= 8 && prefSize <= 24 ? prefSize : 9.75;
    client.buffer.style.fontSize = `${fontSizePt}pt`;
  };

  const applyInputReaderColorPreferences = function() {
    if (!client.inputReader) return;
    const fg = normalizeHexColor(client.preferences?.inputFontColor) || "#EEEEEE";
    const bg = normalizeHexColor(client.preferences?.inputBackgroundColor) || "#333333";
    client.inputReader.style.setProperty("--inputCustomFG", fg);
    client.inputReader.style.setProperty("--inputCustomBG", bg);
    client.inputReader.style.color = fg;
    client.inputReader.style.backgroundColor = bg;
  };

  return {
    applyInputReaderColorPreferences,
    applyInputReaderTextPreferences,
    applyOutputBufferTextPreferences,
    applyTransparentOverlayPreference
  };
}

function setOverlayTransparency(element, transparentOverlay) {
  if (transparentOverlay) {
    element.classList.add("ui-transparent-overlay");
    element.classList.remove("ui-opaque-overlay");
  } else {
    element.classList.remove("ui-transparent-overlay");
    element.classList.add("ui-opaque-overlay");
  }
}

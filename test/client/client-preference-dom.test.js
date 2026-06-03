import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createClientPreferenceDomAppliers } from "../../src/client/client-preference-dom.js";

test("preference DOM appliers update input text and color styles", () => {
  const dom = new JSDOM("<!doctype html><textarea id=\"inputBuffer\"></textarea><div id=\"lineBuffer\"></div>");
  const client = {
    inputReader: dom.window.document.querySelector("#inputBuffer"),
    buffer: dom.window.document.querySelector("#lineBuffer"),
    preferences: {
      inputFont: "lucida",
      inputFontSizePt: 13,
      inputFontColor: "aabbcc",
      inputBackgroundColor: "#102030",
      lineBufferFontSizePt: 10.25
    }
  };
  const appliers = createClientPreferenceDomAppliers({ client, doc: dom.window.document });

  appliers.applyInputReaderTextPreferences();
  appliers.applyInputReaderColorPreferences();
  appliers.applyOutputBufferTextPreferences();

  assert.equal(client.inputReader.classList.contains("lucidaText"), true);
  assert.match(client.inputReader.style.fontFamily, /Lucida Console/i);
  assert.equal(client.inputReader.style.fontSize, "13pt");
  assert.equal(client.inputReader.style.getPropertyValue("--inputCustomFG"), "#AABBCC");
  assert.equal(client.inputReader.style.getPropertyValue("--inputCustomBG"), "#102030");
  assert.equal(client.buffer.style.fontSize, "10.25pt");
});

test("preference DOM appliers toggle overlay transparency classes", () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div class="ui-autocomplete ui-opaque-overlay"></div>
    <div id="shortcuts-overlay" class="ui-opaque-overlay"></div>
    <div id="history-search-overlay" class="ui-opaque-overlay"></div>
    <div id="client-options-overlay" class="ui-opaque-overlay"></div>
    <div id="gameHealthDetail" class="ui-opaque-overlay"></div>
  </body>`);
  const client = {
    preferences: {
      transparentOverlay: true
    }
  };
  const appliers = createClientPreferenceDomAppliers({ client, doc: dom.window.document });

  appliers.applyTransparentOverlayPreference();

  dom.window.document.querySelectorAll(".ui-autocomplete, #shortcuts-overlay, #history-search-overlay, #client-options-overlay, #gameHealthDetail").forEach((overlay) => {
    assert.equal(overlay.classList.contains("ui-transparent-overlay"), true);
    assert.equal(overlay.classList.contains("ui-opaque-overlay"), false);
  });
});

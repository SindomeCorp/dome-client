/* global window, document */
import { setupClientPreferences } from "../src/client/core/preferences.js";
import { setupOutputWindows } from "../src/client/features/output-windows/output-windows.js";
import { setupOutputParser } from "../src/client/features/terminal/output-buffer.js";
import { setupAutoscroll } from "../src/client/features/terminal/autoscroll.js";
import { setupButtons } from "../src/client/features/terminal/buttons.js";
import { setupWindowHandlers } from "../src/client/features/terminal/window-handlers.js";
import { setupInputReader } from "../src/client/features/terminal/input-reader.js";
import { searchSnapshot, exportSnapshot } from "../src/client/features/output-windows/history-tools.js";

const client = {
  client: document.querySelector("#browser-client"),
  buffer: document.querySelector("#lineBuffer"),
  inputReader: document.querySelector("#inputBuffer"),
  scrollButton: document.querySelector("#button-auto-scroll"),
  clearButton: document.querySelector("#button-clear-buffer"),
  saveButton: document.querySelectorAll("#button-save-mini"),
  clientOptionsButton: document.querySelector("#button-client-options"),
  clientOptionsOverlay: document.querySelector("#client-options-overlay"),
  clientOptionsClose: document.querySelector("#button-client-options-close"),
  shortcutsButton: document.querySelector("#button-shortcuts"),
  shortcutsOverlay: document.querySelector("#shortcuts-overlay"),
  health: { showStatus(message) { window.lastOutputStatus = message; } },
  socket: { emit(_event, _command, callback) { callback?.({ status: "command sent" }); } },
  spawned: {}, preferences: {}
};
setupClientPreferences({ client, doc: document, win: window });
client.preferences = client.readPreferences();
if (client.preferences.colorSet !== "normal") {
  client.buffer.classList.add("colorset-" + client.preferences.colorSet);
  client.inputReader.classList.add("colorset-" + client.preferences.colorSet);
}
const manager = setupOutputWindows({ client, doc: document, win: window });
setupWindowHandlers({ client, doc: document, win: window });
setupAutoscroll({ client, doc: document, win: window });
setupOutputParser({ client, win: window });
setupButtons({ client, doc: document });
setupInputReader({ client, doc: document });

window.outputTest = {
  client, manager,
  searchSnapshot, exportSnapshot,
  async feed(text) {
    client.parseSocketData(text);
    await manager.idle();
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  }
};

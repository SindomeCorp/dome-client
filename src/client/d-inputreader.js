import { dome, socket, logger } from "./b-variables.js";
import { wireHistorySearchOverlay } from "./history-search-overlay.js";
import { createCommandDispatcher } from "./input-command-dispatch.js";
import { wireInputHistoryControls } from "./input-history-controls.js";
import {
  createHistoryState,
  recordSubmittedCommand,
  rememberDraftInput,
  resetHistoryNavigation
} from "./input-history.js";
import { store } from "./store.js";

// Wires input-reader dependencies while feature modules own their behavior.
dome.setupInputReader = () => {
  const { sendCommand } = createCommandDispatcher({ dome, socket });

  // prevent the backspace key from navigating away from the page
  document.addEventListener("keydown", (e) => {
    if (e.key === "Pause" && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      // 'pause/break' key
      // enable / disable scroll
      dome.onToggleAutoScroll();
      return;
    } else if (e.key === "Home" && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      // home
      // return the focus to the input reader
      dome.inputReader.focus();
      return;
    } else if (e.key === "Insert" && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      // insert key
      // this code allows you to pop open a window to send a command to the MOO
      // it's useful when you have a bunch of stuff typed out in your normal text input
      const fastCommand = prompt("Please enter command to send:", "");
      if (fastCommand !== null && fastCommand !== "") {
        sendCommand(fastCommand);
      }
    }
    const isInputFocused = document.activeElement.matches("input:focus, textarea:focus");
    if (e.key === "Backspace" && !isInputFocused) {
      e.preventDefault();
    }
  });

  const historyState = createHistoryState(store.get("my-input-buffer") || []);
  const commandBuffer = historyState.entries;

  if ( dome.inputReader ) {
    const inputReader = dome.inputReader;

    wireHistorySearchOverlay({
      document,
      inputReader,
      historySource: () => commandBuffer.slice().reverse(),
      onSelect(selected) {
        inputReader.value = selected;
        rememberDraftInput(historyState, selected);
        resetHistoryNavigation(historyState);
      }
    });

    wireInputHistoryControls({
      document,
      inputReader,
      historyState,
      store
    });

    inputReader.addEventListener("keypress", (event) => {
      if ( event.key === "Enter" && !event.shiftKey ) {
        if (
          dome.autoComplete &&
          typeof inputReader.commandSuggestions === "function"
        ) {
          try {
            inputReader.commandSuggestions("close");
          } catch (e) {
            logger.error(e);
          }
        }
        // enter key
        event.preventDefault();
        const command = inputReader.value;
        if (command.trim() === "") {
          sendCommand("");
          inputReader.value = "";
          return false;
        }
        sendCommand(command);

        if (recordSubmittedCommand(historyState, command)) {
          store.put("my-input-buffer", commandBuffer); // localStore deals in strings, this won't work as an array Chad. - Future Chad
        }
        inputReader.value = "";
        return false;
      } else {
        setTimeout( () => {
          rememberDraftInput(historyState, inputReader.value);
        }, 5 );
      }
    });
  }
};

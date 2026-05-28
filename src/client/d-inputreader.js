import { dome, socket, logger } from "./b-variables.js";
import { store } from "./store.js";

/**
 * Handles arrow-key navigation within the input buffer.
 *
 * Originally the Up and Down arrows always cycled through previously sent
 * commands. This made it impossible to move the caret within long inputs.
 *
 * Now the arrows move the cursor normally when the input has 150 or more
 * characters. History navigation still occurs when the caret is at the start
 * (Up) or end (Down) of the line.
 */
dome.setupInputReader = () => {

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

  let lastInput = "";
  const commandBuffer = store.get("my-input-buffer") || [];
  let commandPointer = commandBuffer.length || -1;

  const sendCommand = (command) => {
    if (command.startsWith("@client-option")) {
      if (dome.preferences.localEcho) {
        dome.buffer.insertAdjacentHTML("beforeend", "<span class=\"input-echo\">&gt;" + command + "</span>\n");
      }
      if (dome.parseClientOptionCommand) dome.parseClientOptionCommand(command);
    } else if (command === "@test") {
      if (dome.preferences.localEcho) {
        dome.buffer.insertAdjacentHTML("beforeend", "<span class=\"input-echo\">&gt;" + command + "</span>\n");
      }
      dome.openIDE?.({
        editorName: "Test Tab",
        uploadCommand: "@save-test",
        buffer: "This is some test data"
      });
    } else {
      if (dome.preferences.localEcho) {
        dome.buffer.insertAdjacentHTML("beforeend", "<span class=\"input-echo\">&gt;" + command + "</span>\n");
      }
      socket.emit("input", command, (state) => {
        if (dome.setFadeText && dome.statusDisplay) {
          dome.setFadeText(
            dome.statusDisplay,
            (state.status && state.status.indexOf("command sent") == 0) ? "SENT" : state.status,
            false
          );
        }
      });
    }
  };

  const getCursorPosition = (textarea) => {
    if ("selectionStart" in textarea) {
      return {
        start: textarea.selectionStart,
        end: textarea.selectionEnd
      };
    } else {
      // really just IE
      return { start: 1, end: 1 };
    }
  };

  if ( dome.inputReader ) {
    const inputReader = dome.inputReader;
    const historySearchOverlay = document.querySelector("#history-search-overlay");
    const historySearchQuery = document.querySelector("#history-search-query");
    const historySearchResults = document.querySelector("#history-search-results");
    const historySearchEmpty = document.querySelector("#history-search-empty");
    const historySearchClose = document.querySelector("#button-history-search-close");
    let historySearchOpen = false;
    let historySearchMatches = [];
    let historySearchActiveIndex = -1;

    const getHistorySearchSource = () => commandBuffer.slice().reverse();
    const closeHistorySearch = ({ focusInput = true } = {}) => {
      if (!historySearchOverlay) {
        return;
      }
      historySearchOpen = false;
      historySearchMatches = [];
      historySearchActiveIndex = -1;
      historySearchOverlay.classList.add("hide");
      if (focusInput) {
        inputReader.focus();
      }
    };
    const commitHistorySearchSelection = () => {
      if (!historySearchOpen || historySearchActiveIndex < 0) {
        return false;
      }
      const selected = historySearchMatches[historySearchActiveIndex];
      if (typeof selected !== "string") {
        return false;
      }
      inputReader.value = selected;
      lastInput = selected;
      commandPointer = commandBuffer.length;
      closeHistorySearch({ focusInput: true });
      const end = inputReader.value.length;
      if ("selectionStart" in inputReader) {
        inputReader.selectionStart = end;
        inputReader.selectionEnd = end;
      }
      return true;
    };
    const renderHistorySearchResults = () => {
      if (!historySearchResults || !historySearchEmpty) {
        return;
      }
      historySearchResults.innerHTML = "";
      const hasMatches = historySearchMatches.length > 0;
      historySearchEmpty.classList.toggle("hide", hasMatches);
      if (!hasMatches) {
        return;
      }
      let activeItem = null;
      historySearchMatches.forEach((entry, index) => {
        const item = document.createElement("li");
        item.className = "history-search-item";
        item.textContent = entry;
        if (index === historySearchActiveIndex) {
          item.classList.add("active");
          item.setAttribute("aria-selected", "true");
          activeItem = item;
        }
        item.addEventListener("mousedown", (event) => {
          event.preventDefault();
        });
        item.addEventListener("click", () => {
          historySearchActiveIndex = index;
          commitHistorySearchSelection();
        });
        historySearchResults.appendChild(item);
      });
      if (activeItem && typeof activeItem.scrollIntoView === "function") {
        activeItem.scrollIntoView({ block: "nearest" });
      }
    };
    const applyHistorySearchQuery = () => {
      if (!historySearchQuery) {
        return;
      }
      const needle = historySearchQuery.value.trim().toLowerCase();
      const source = getHistorySearchSource();
      const uniqueMatches = [];
      const seen = new Set();
      source.forEach((entry) => {
        const normalized = String(entry);
        if (needle !== "" && !normalized.toLowerCase().includes(needle)) {
          return;
        }
        if (seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        uniqueMatches.push(normalized);
      });
      historySearchMatches = uniqueMatches;
      historySearchActiveIndex = historySearchMatches.length > 0 ? 0 : -1;
      renderHistorySearchResults();
    };
    const moveHistorySearchActive = (delta) => {
      if (!historySearchMatches.length) {
        return;
      }
      const max = historySearchMatches.length - 1;
      historySearchActiveIndex = Math.max(0, Math.min(max, historySearchActiveIndex + delta));
      renderHistorySearchResults();
    };
    const openHistorySearch = () => {
      if (!historySearchOverlay || !historySearchQuery) {
        return;
      }
      historySearchOpen = true;
      historySearchOverlay.classList.remove("hide");
      historySearchQuery.value = "";
      applyHistorySearchQuery();
      historySearchQuery.focus();
      historySearchQuery.select();
    };

    if (historySearchOverlay) {
      historySearchOverlay.addEventListener("click", (event) => {
        if (event.target === historySearchOverlay) {
          closeHistorySearch({ focusInput: true });
        }
      });
    }
    if (historySearchClose) {
      historySearchClose.addEventListener("click", () => {
        closeHistorySearch({ focusInput: true });
      });
    }
    if (historySearchQuery) {
      historySearchQuery.addEventListener("input", () => {
        applyHistorySearchQuery();
      });
      historySearchQuery.addEventListener("keydown", (event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveHistorySearchActive(-1);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveHistorySearchActive(1);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          commitHistorySearchSelection();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeHistorySearch({ focusInput: true });
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && historySearchOpen) {
        event.preventDefault();
        closeHistorySearch({ focusInput: true });
        return;
      }
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.key.toLowerCase() !== "r") {
        return;
      }
      if (historySearchOpen) {
        // Let browser default behavior run when Ctrl+R is pressed again.
        return;
      }
      event.preventDefault();
      openHistorySearch();
    });

    const applyHistoryNavigation = (key) => {
      const lineLength = inputReader.value.length;
      if ( key === "ArrowUp" ) {
        // Up arrow: recall previous command when at line start or line is short
        const cursor = getCursorPosition( inputReader );
        if ( commandPointer >= 0 && cursor.start == cursor.end && ( lineLength < 150 || cursor.start === 0 ) ) {
          commandPointer = ( commandPointer <= -1 ? commandBuffer.length : commandPointer ) - 1;
          inputReader.value = commandBuffer[ commandPointer ];
          return true;
        }
      } else if ( key === "ArrowDown" ) {
        // Down arrow: show next command when at line end or line is short
        const cursor = getCursorPosition( inputReader );
        if ( cursor.start == cursor.end && ( lineLength < 150 || cursor.start === lineLength ) ) {
          if ( commandPointer < commandBuffer.length - 1 ) {
            // down (show next newest)
            commandPointer = ( commandPointer + 1 > commandBuffer.length ? 0 : commandPointer ) + 1;
            inputReader.value = commandBuffer[ commandPointer ];
            return true;
          } else if ( commandPointer >= commandBuffer.length - 1 ) {
            // down (at last, don't show me anything)
            commandPointer = commandBuffer.length;
            if ( inputReader.value == lastInput && inputReader.value != "" ) {
              // clear the buffer but don't forget what was in it
              // but dont add blank lines for each down when there is nothing there
              commandBuffer[ commandBuffer.length ] = inputReader.value;
              if ( commandBuffer.length > 2e3 ) {
                commandBuffer.shift();
              }
              commandPointer = commandBuffer.length;
              store.put( "my-input-buffer", commandBuffer );
              inputReader.value = "";
              lastInput = "";
            } else {
              inputReader.value = lastInput;
            }
            return true;
          }
        }
      }
      return false;
    };
    const applyHistoryNavigationFromButtons = (key) => {
      if ( key === "ArrowUp" ) {
        if ( commandPointer >= 0 ) {
          commandPointer = ( commandPointer <= -1 ? commandBuffer.length : commandPointer ) - 1;
          inputReader.value = commandBuffer[ commandPointer ];
          return true;
        }
      } else if ( key === "ArrowDown" ) {
        if ( commandPointer < commandBuffer.length - 1 ) {
          commandPointer = ( commandPointer + 1 > commandBuffer.length ? 0 : commandPointer ) + 1;
          inputReader.value = commandBuffer[ commandPointer ];
          return true;
        } else if ( commandPointer >= commandBuffer.length - 1 ) {
          commandPointer = commandBuffer.length;
          if ( inputReader.value == lastInput && inputReader.value != "" ) {
            commandBuffer[ commandBuffer.length ] = inputReader.value;
            if ( commandBuffer.length > 2e3 ) {
              commandBuffer.shift();
            }
            commandPointer = commandBuffer.length;
            store.put( "my-input-buffer", commandBuffer );
            inputReader.value = "";
            lastInput = "";
          } else {
            inputReader.value = lastInput;
          }
          return true;
        }
      }
      return false;
    };

    inputReader.addEventListener("keydown", (event) => {
      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && applyHistoryNavigation(event.key)) {
        event.preventDefault();
        return false;
      }
    });
    inputReader.addEventListener("keypress", (event) => {
      if ( event.key === "Backspace" ) {

      }
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

        commandBuffer[ commandBuffer.length ] = command;
        if ( commandBuffer.length > 2000 ) {
          commandBuffer.shift();
        }
        commandPointer = commandBuffer.length;
        store.put( "my-input-buffer", commandBuffer ); // localStore deals in strings, this won't work as an array Chad. - Future Chad
        inputReader.value = "";
        return false;
      } else {
        setTimeout( () => {
          lastInput = inputReader.value;
        }, 5 );
      }
    });
    inputReader.addEventListener("focus", () => {
    });

    const wireHistoryButton = (selector, key) => {
      const button = document.querySelector(selector);
      if (!button) {
        return;
      }
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        inputReader.focus();
        applyHistoryNavigationFromButtons(key);
      });
    };
    wireHistoryButton("#button-input-history-up", "ArrowUp");
    wireHistoryButton("#button-input-history-down", "ArrowDown");
  }
};

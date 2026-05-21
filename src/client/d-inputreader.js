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
    inputReader.addEventListener("keydown", (event) => {
      // total characters in the input; used to decide when to allow history recall
      const lineLength = inputReader.value.length;
      if ( event.key === "ArrowUp" ) {
        // Up arrow: recall previous command when at line start or line is short
        const cursor = getCursorPosition( inputReader );
        if ( commandPointer >= 0 && cursor.start == cursor.end && ( lineLength < 150 || cursor.start === 0 ) ) {
          commandPointer = ( commandPointer <= -1 ? commandBuffer.length : commandPointer ) - 1;
          inputReader.value = commandBuffer[ commandPointer ];
          event.preventDefault();
          return false;
        }
      } else if ( event.key === "ArrowDown" ) {
        // Down arrow: show next command when at line end or line is short
        const cursor = getCursorPosition( inputReader );
        if ( cursor.start == cursor.end && ( lineLength < 150 || cursor.start === lineLength ) ) {
          if ( commandPointer < commandBuffer.length - 1 ) {
            // down (show next newest)
            commandPointer = ( commandPointer + 1 > commandBuffer.length ? 0 : commandPointer ) + 1;
            inputReader.value = commandBuffer[ commandPointer ];
            event.preventDefault();
            return false;
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
            event.preventDefault();
            return false;
          }
        }
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
      button.addEventListener("click", () => {
        inputReader.focus();
        const inputWindow = inputReader.ownerDocument?.defaultView;
        if (!inputWindow || typeof inputWindow.KeyboardEvent !== "function") {
          return;
        }
        inputReader.dispatchEvent(new inputWindow.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true
        }));
      });
    };
    wireHistoryButton("#button-input-history-up", "ArrowUp");
    wireHistoryButton("#button-input-history-down", "ArrowDown");
  }
};

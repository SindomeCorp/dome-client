import { navigateHistory } from "./input-history.js";

/**
 * Handles arrow-key navigation within the input buffer.
 *
 * Originally the Up and Down arrows always cycled through previously sent
 * commands. This made it impossible to move the caret within long inputs.
 *
 * Now the arrows move the cursor normally when the input has 150 or more
 * characters. History navigation still occurs when the caret is at the start
 * (Up) or end (Down) of the line. Mobile history buttons force history
 * navigation regardless of cursor position.
 */
export const wireInputHistoryControls = ({
  document,
  inputReader,
  historyState,
  store
}) => {
  const commandBuffer = historyState.entries;

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

  const applyHistoryNavigation = (key) => {
    const result = navigateHistory(historyState, {
      key,
      currentInput: inputReader.value,
      cursor: getCursorPosition(inputReader)
    });
    if (!result.navigated) {
      return false;
    }
    inputReader.value = result.value;
    if (result.storedDraft) {
      store.put("my-input-buffer", commandBuffer);
    }
    return true;
  };

  const applyHistoryNavigationFromButtons = (key) => {
    const result = navigateHistory(historyState, {
      key,
      currentInput: inputReader.value,
      force: true
    });
    if (!result.navigated) {
      return false;
    }
    inputReader.value = result.value;
    if (result.storedDraft) {
      store.put("my-input-buffer", commandBuffer);
    }
    return true;
  };

  inputReader.addEventListener("keydown", (event) => {
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && applyHistoryNavigation(event.key)) {
      event.preventDefault();
      return false;
    }
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
};

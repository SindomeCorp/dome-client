export const HISTORY_LIMIT = 2000;
export const LONG_INPUT_HISTORY_THRESHOLD = 150;

export const createHistoryState = (entries = []) => ({
  entries,
  pointer: entries.length || -1,
  draft: ""
});

export const rememberDraftInput = (state, input) => {
  state.draft = input;
};

export const resetHistoryNavigation = (state) => {
  state.pointer = state.entries.length;
};

export const recordSubmittedCommand = (state, command) => {
  if (command.trim() === "") {
    return false;
  }
  state.entries[state.entries.length] = command;
  if (state.entries.length > HISTORY_LIMIT) {
    state.entries.shift();
  }
  resetHistoryNavigation(state);
  return true;
};

const isCollapsedCursor = (cursor) => cursor.start === cursor.end;

const canNavigateWithCursor = ({ key, currentInput, cursor, force }) => {
  if (force) {
    return true;
  }
  const lineLength = currentInput.length;
  if (!isCollapsedCursor(cursor)) {
    return false;
  }
  if (lineLength < LONG_INPUT_HISTORY_THRESHOLD) {
    return true;
  }
  if (key === "ArrowUp") {
    return cursor.start === 0;
  }
  return cursor.start === lineLength;
};

export const navigateHistory = (state, {
  key,
  currentInput,
  cursor = { start: 1, end: 1 },
  force = false
}) => {
  if (!canNavigateWithCursor({ key, currentInput, cursor, force })) {
    return { navigated: false };
  }

  if (key === "ArrowUp") {
    if (state.pointer >= 0) {
      state.pointer = (state.pointer <= -1 ? state.entries.length : state.pointer) - 1;
      return {
        navigated: true,
        value: state.entries[state.pointer],
        storedDraft: false
      };
    }
    return { navigated: false };
  }

  if (key === "ArrowDown") {
    if (state.pointer < state.entries.length - 1) {
      state.pointer = (state.pointer + 1 > state.entries.length ? 0 : state.pointer) + 1;
      return {
        navigated: true,
        value: state.entries[state.pointer],
        storedDraft: false
      };
    }
    if (state.pointer >= state.entries.length - 1) {
      state.pointer = state.entries.length;
      if (currentInput === state.draft && currentInput !== "") {
        state.entries[state.entries.length] = currentInput;
        if (state.entries.length > HISTORY_LIMIT) {
          state.entries.shift();
        }
        state.pointer = state.entries.length;
        state.draft = "";
        return {
          navigated: true,
          value: "",
          storedDraft: true
        };
      }
      return {
        navigated: true,
        value: state.draft,
        storedDraft: false
      };
    }
  }

  return { navigated: false };
};

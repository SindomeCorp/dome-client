import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHistoryState,
  HISTORY_LIMIT,
  LONG_INPUT_HISTORY_THRESHOLD,
  navigateHistory,
  recordSubmittedCommand,
  rememberDraftInput
} from "../../src/client/features/terminal/input-history.js";

test("navigates previous and next history entries", () => {
  const state = createHistoryState(["look", "inventory"]);

  const previous = navigateHistory(state, {
    key: "ArrowUp",
    currentInput: "",
    cursor: { start: 0, end: 0 }
  });
  assert.equal(previous.navigated, true);
  assert.equal(previous.value, "inventory");

  const older = navigateHistory(state, {
    key: "ArrowUp",
    currentInput: "inventory",
    cursor: { start: 0, end: 0 }
  });
  assert.equal(older.navigated, true);
  assert.equal(older.value, "look");

  const newer = navigateHistory(state, {
    key: "ArrowDown",
    currentInput: "look",
    cursor: { start: 4, end: 4 }
  });
  assert.equal(newer.navigated, true);
  assert.equal(newer.value, "inventory");
});

test("restores draft input when navigating down at the end", () => {
  const state = createHistoryState(["look"]);
  rememberDraftInput(state, "say hi");

  navigateHistory(state, {
    key: "ArrowUp",
    currentInput: "say hi",
    cursor: { start: 0, end: 0 }
  });
  const result = navigateHistory(state, {
    key: "ArrowDown",
    currentInput: "look",
    cursor: { start: 4, end: 4 }
  });

  assert.equal(result.navigated, true);
  assert.equal(result.value, "say hi");
  assert.equal(result.storedDraft, false);
});

test("clears and stores draft input when down is pressed at the end", () => {
  const state = createHistoryState(["look"]);
  rememberDraftInput(state, "temp");

  const result = navigateHistory(state, {
    key: "ArrowDown",
    currentInput: "temp",
    cursor: { start: 4, end: 4 }
  });

  assert.equal(result.navigated, true);
  assert.equal(result.value, "");
  assert.equal(result.storedDraft, true);
  assert.deepEqual(state.entries, ["look", "temp"]);
  assert.equal(state.draft, "");
});

test("forced navigation ignores long-input cursor gating", () => {
  const state = createHistoryState(["look"]);
  const currentInput = "a".repeat(LONG_INPUT_HISTORY_THRESHOLD + 10);

  const blocked = navigateHistory(state, {
    key: "ArrowUp",
    currentInput,
    cursor: { start: 5, end: 5 }
  });
  assert.equal(blocked.navigated, false);

  const forced = navigateHistory(state, {
    key: "ArrowUp",
    currentInput,
    cursor: { start: 5, end: 5 },
    force: true
  });
  assert.equal(forced.navigated, true);
  assert.equal(forced.value, "look");
});

test("long input only navigates at arrow boundaries", () => {
  const state = createHistoryState(["look"]);
  const currentInput = "a".repeat(LONG_INPUT_HISTORY_THRESHOLD);

  assert.equal(navigateHistory(state, {
    key: "ArrowUp",
    currentInput,
    cursor: { start: 1, end: 1 }
  }).navigated, false);
  assert.equal(navigateHistory(state, {
    key: "ArrowUp",
    currentInput,
    cursor: { start: 0, end: 0 }
  }).navigated, true);

  const downState = createHistoryState(["look"]);
  assert.equal(navigateHistory(downState, {
    key: "ArrowDown",
    currentInput,
    cursor: { start: currentInput.length - 1, end: currentInput.length - 1 }
  }).navigated, false);
  assert.equal(navigateHistory(downState, {
    key: "ArrowDown",
    currentInput,
    cursor: { start: currentInput.length, end: currentInput.length }
  }).navigated, true);
});

test("empty commands are not recorded", () => {
  const state = createHistoryState(["look"]);

  assert.equal(recordSubmittedCommand(state, ""), false);
  assert.equal(recordSubmittedCommand(state, "   "), false);
  assert.deepEqual(state.entries, ["look"]);
});

test("history is capped at 2000 entries", () => {
  const entries = Array.from({ length: HISTORY_LIMIT }, (_, index) => `c${index}`);
  const state = createHistoryState(entries);

  assert.equal(recordSubmittedCommand(state, "extra"), true);
  assert.equal(state.entries.length, HISTORY_LIMIT);
  assert.equal(state.entries[0], "c1");
  assert.equal(state.entries.at(-1), "extra");
  assert.equal(state.pointer, HISTORY_LIMIT);
});

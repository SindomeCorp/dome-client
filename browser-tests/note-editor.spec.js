/* global window */
import { test, expect } from "@playwright/test";

test("the note viewer shows real metadata and feedback for an explicit save", async ({ page }) => {
  await page.addInitScript(() => {
    window.editorData = {
      editorName: "Fixture note",
      uploadCommand: "SAVE",
      buffer: "Initial note",
      note: { subject: "Fixture subject", createdat: "Today" }
    };
    window.noteCommands = [];
    window.uploadSocket = { emit: (...args) => window.noteCommands.push(args) };
  });
  await page.goto("/editor/note-viewer/");
  await expect(page).toHaveTitle("Editing Fixture note");
  await expect(page.locator(".note-subject .header-value")).toHaveText("Fixture subject");
  await expect(page.locator(".note-authors .header-value")).toBeEmpty();
  await expect(page.locator(".note-objects .header-value")).toBeEmpty();
  const body = page.getByRole("textbox");
  const save = page.getByRole("button", { name: "SAVE" });
  await expect(body).toHaveValue("Initial note");
  expect(await page.evaluate(() => window.noteCommands)).toEqual([]);

  await body.fill("  ");
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Note cannot be empty");
  expect(await page.evaluate(() => window.noteCommands)).toEqual([]);

  await body.fill("Revised note");
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  expect(await page.evaluate(() => window.noteCommands)).toEqual([
    ["input", "SAVE"], ["input", "Revised note\n."]
  ]);
});

/* global window */
import { test, expect } from "@playwright/test";

test("the note viewer shows real metadata and feedback for an explicit save", async ({ page, context }, testInfo) => {
  await context.addInitScript(() => {
    window.editorData = {
      editorName: "Fixture note",
      uploadCommand: "SAVE",
      buffer: "Initial note",
      note: { subject: "Fixture subject", createdat: "Today" }
    };
    window.noteCommands = [];
    window.uploadSocket = { emit: (...args) => window.noteCommands.push(args) };
  });
  await page.goto("/");
  await page.setContent("<a href=\"/editor/note-viewer/\" target=\"_blank\">Open fixture note</a>");
  const opened = page.waitForEvent("popup", { timeout: 5000 });
  await page.getByRole("link", { name: "Open fixture note" }).click();
  const note = await opened;
  await expect(note).toHaveTitle("Editing Fixture note");
  await expect(note.locator(".note-subject .header-value")).toHaveText("Fixture subject");
  await expect(note.locator(".note-timestamp .header-value")).toHaveText("Today");
  await expect(note.locator(".note-authors .header-value")).toBeEmpty();
  await expect(note.locator(".note-objects .header-value")).toBeEmpty();
  const body = note.getByRole("textbox");
  const save = note.getByRole("button", { name: "SAVE" });
  const close = note.getByRole("button", { name: "CLOSE" });
  const status = note.getByRole("status");
  const prompts = [];
  note.on("dialog", async (dialog) => {
    prompts.push(dialog.message());
    await dialog.dismiss();
  });
  await expect(body).toHaveValue("Initial note");
  expect(await note.evaluate(() => window.noteCommands)).toEqual([]);

  await body.fill("  ");
  if (testInfo.project.use.isMobile) {
    await expect.poll(() => save.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      return rect.left >= viewport.offsetLeft && rect.right <= viewport.offsetLeft + viewport.width;
    })).toBe(true);
  }
  await save.click();
  await expect(status).toHaveText("Note cannot be empty");
  await expect(status).toHaveClass("status error");
  await close.click();
  expect(prompts).toEqual(["Abort editing and lose your changes?"]);
  await expect(body).toHaveValue("  ");
  expect(await note.evaluate(() => window.noteCommands)).toEqual([]);

  await body.fill("Revised note");
  await save.click();
  await expect(status).toHaveText("Saved");
  await expect(status).toHaveClass("status success");
  expect(await note.evaluate(() => window.noteCommands)).toEqual([
    ["input", "SAVE"], ["input", "Revised note\n."]
  ]);
  const closed = note.waitForEvent("close", { timeout: 5000 });
  await close.click().catch((error) => {
    if (!note.isClosed()) throw error; // Firefox may close before acknowledging the click.
  });
  await closed;
  expect(prompts).toHaveLength(1);
});

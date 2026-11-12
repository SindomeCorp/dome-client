/* global window, document, requestAnimationFrame */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.outputTest);
});

test("routing, split positions, keyboard resize and close preserve output", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() => window.outputTest.feed("before\n"));
  await page.getByRole("button", { name: "SPLIT", exact: true }).click();
  await page.getByRole("button", { name: "Configure output window" }).click();
  await page.getByLabel("Team Chat", { exact: true }).check();
  await page.locator("#output-layout").selectOption("bottom");
  await page.locator("#button-client-options-close").click();
  await page.evaluate(() => window.outputTest.feed("main one\n\u001b[31m[-][Team-Chat] chat\u001b[0m\nmain two\n"));
  await expect(page.locator("#secondaryBuffer")).toContainText("[-][Team-Chat] chat");
  await expect(page.locator("#lineBuffer")).not.toContainText("[-][Team-Chat] chat");
  const divider = page.getByRole("separator");
  await divider.focus();
  await divider.press("End");
  await expect(divider).toHaveAttribute("aria-valuenow", "85");
  await divider.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "15");
  await page.getByRole("button", { name: "Close secondary output window" }).click();
  await expect(page.locator("#lineBuffer")).toContainText("[-][Team-Chat] chat");
  await expect(page.locator("#secondaryBuffer")).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("large history stays bounded and Find locates an unmounted message", async ({ page }) => {
  await page.evaluate(() => window.outputTest.feed(Array.from({ length: 20_000 }, (_, i) => "history message " + i).join("\n") + "\n"));
  expect(await page.locator("[data-output-id]").count()).toBeLessThan(400);
  await page.locator("#inputBuffer").focus();
  await page.keyboard.press("Control+f");
  await page.locator("#output-find-query").fill("history message 1234");
  await expect(page.locator("#output-find-count")).toContainText("of");
  await expect(page.locator("#lineBuffer mark").first()).toHaveText("history message 1234");
  expect(await page.locator("[data-output-id]").count()).toBeLessThan(400);
  await page.locator("#output-find-query").press("Escape");
  await expect(page.locator("#output-find")).not.toBeVisible();
});

test("panels pause independently and split settings survive a reload", async ({ page }) => {
  await page.evaluate(() => {
    window.outputTest.manager.updateSettings({ open: true, position: "left", selected: ["team-chat"] });
    return window.outputTest.feed("main\n[-][Team-Chat] one\n");
  });
  await page.getByRole("button", { name: "Pause secondary scrolling", exact: true }).click();
  await page.evaluate(() => window.outputTest.feed("main two\n[-][Team-Chat] two\n"));
  await expect(page.locator("[data-output-unread=secondary]")).toContainText("1 unread");
  await expect(page.locator("[data-output-unread=main]")).toBeEmpty();
  await page.reload();
  await page.waitForFunction(() => window.outputTest);
  await expect(page.locator("#output-workspace")).toHaveAttribute("data-position", "left");
  expect(await page.evaluate(() => window.outputTest.manager.history.length)).toBe(0);
});

test("Find works with splits disabled and does not reannounce old output", async ({ page }) => {
  await page.goto("/?splits=off");
  await page.waitForFunction(() => window.outputTest);
  await expect(page.locator("#button-output-split")).not.toBeVisible();
  await page.evaluate(() => window.outputTest.feed("old searchable line\nlast line\n"));
  const announcement = await page.locator("#output-announcements").textContent();
  await page.locator("#button-output-find").click();
  await page.locator("#output-find-query").fill("old searchable");
  await expect(page.locator("mark")).toHaveText("old searchable");
  await expect(page.locator("#output-announcements")).toHaveText(announcement);
  await expect(page.locator("#lineBuffer")).not.toHaveAttribute("aria-live");
});

test("unified download includes offscreen history once in arrival order", async ({ page }) => {
  await page.evaluate(() => {
    window.outputTest.manager.updateSettings({ open: true, selected: ["team-chat"] });
    return window.outputTest.feed("first unified\n[-][Team-Chat] middle unified\nlast unified\n");
  });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#button-save-mini").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let html = "";
  for await (const chunk of stream) html += chunk;
  expect(html.indexOf("first unified")).toBeLessThan(html.indexOf("middle unified"));
  expect(html.indexOf("middle unified")).toBeLessThan(html.indexOf("last unified"));
  expect(html.match(/middle unified/g)).toHaveLength(1);
  expect(html.includes("class=\"output-spacer\"")).toBe(false);
});

test("drag resizing and a paused variable-height anchor remain usable", async ({ page }, testInfo) => {
  await page.evaluate(() => {
    window.outputTest.manager.updateSettings({ open: true });
    return window.outputTest.feed(Array.from({ length: 1000 }, (_, i) => "line " + i + " wrapped content ".repeat(i % 8 + 1)).join("\n") + "\n");
  });
  await page.evaluate(() => window.outputTest.manager.views.main.jump(500));
  await expect(page.locator("#lineBuffer [data-output-id='500']")).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const before = await page.locator("#lineBuffer [data-output-id='500']").boundingBox();
  const divider = page.locator("#output-divider");
  const box = await divider.boundingBox();
  if (testInfo.project.name === "narrow-touch") {
    const touch = await page.context().newCDPSession(page);
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...start, x: start.x - 35 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 35, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
  }
  await expect(divider).not.toHaveAttribute("aria-valuenow", "30");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await page.locator("#lineBuffer [data-output-id='500']").boundingBox();
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);
  expect(await page.locator("[data-output-id]").count()).toBeLessThan(400);
});

test("native selection stays mounted while new output arrives", async ({ page }) => {
  await page.evaluate(() => window.outputTest.feed("select this text\nsecond line\n"));
  await page.evaluate(() => {
    const row = document.querySelector("#lineBuffer [data-output-id]");
    const range = document.createRange();
    range.selectNodeContents(row);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
  });
  await page.evaluate(() => window.outputTest.feed(Array.from({ length: 1000 }, (_, i) => "later " + i).join("\n") + "\n"));
  expect(await page.evaluate(() => document.getSelection().toString())).toBe("select this text");
  await page.evaluate(() => document.getSelection().removeAllRanges());
  await expect(page.locator("#lineBuffer")).toContainText("later 999");
});

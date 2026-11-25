/* global window, document, NodeFilter */
import { test, expect } from "@playwright/test";
import { mkdir, chmod } from "node:fs/promises";
import { defaultContextMenus } from "../src/shared/context-menus.js";

async function start(page, { clipboardStub = true } = {}) {
  if (clipboardStub) await page.context().addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(text) { window.contextCopied = text; } } });
  });
  await page.goto("/");
  await page.evaluate(() => window.outputTest.client.contextMenus.ready);
}

async function feed(page, text) {
  await page.evaluate((value) => window.outputTest.feed(value), text);
}

async function editConfig(page, mutate) {
  const value = await page.evaluate(() => structuredClone(window.outputTest.client.contextMenus.config));
  const revision = await page.evaluate(() => window.outputTest.client.contextMenus.revision);
  mutate(value);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await page.locator("#context-menu-json").fill(JSON.stringify(value, null, 2));
  await page.locator("#context-menu-reload").click();
  await expect.poll(() => page.evaluate(() => window.outputTest.client.contextMenus.revision)).toBeGreaterThan(revision);
  await expect(page.locator("#context-menu-error")).toBeEmpty();
}

async function rightText(page, row, index = 0) {
  const point = await row.evaluate((element, offset) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (offset >= node.length) { offset -= node.length; continue; }
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
  }, index);
  await page.mouse.click(point.x, point.y, { button: "right" });
  return point;
}

async function openSelection(page) {
  await expect.poll(async () => {
    await page.keyboard.press("Shift+F10");
    return page.getByRole("menuitem", { name: "Open in Scratchpad" }).count();
  }).toBe(1);
}

async function fixtureState(page) {
  return (await page.request.get("/fixture/state")).json();
}

async function socketFeed(page, text) {
  await page.request.post("/fixture/data", { data: { text } });
}

test("context menus: defaults target ANSI-split references and preserve native no-match menus", async ({ page }) => {
  await start(page);
  await feed(page, "#12\u001b[31m3:look\u001b[0m #123.name #123 ordinary\n");
  const row = page.locator("#lineBuffer [data-output-id]").last();
  await expect.poll(async () => { await rightText(page, row); return page.getByRole("menuitem", { name: "Copy verb reference" }).count(); }).toBe(1);
  await page.getByRole("menuitem", { name: "Copy verb reference" }).click();
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#123:look");
  await expect.poll(async () => { await rightText(page, row, 10); return page.getByRole("menuitem", { name: "Copy property reference" }).count(); }).toBe(1);
  await page.keyboard.press("Escape");
  await rightText(page, row, 25);
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
});

test("context menus: Options commands, global override, session reset and failed reload use real parser", async ({ page }) => {
  await start(page);
  await editConfig(page, (config) => {
    config.rules[2].actions.push({ id: "verbs", label: "My verb list", type: "game-command", template: "@verbs ${object}" });
    config.profiles.push({ ...config.profiles[0], id: "staff", label: "Programmer" });
    config.profiles.push({ ...config.profiles[0], id: "local", label: "My tools" });
  });
  await feed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"staff\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Programmer (selected by server)");
  await page.locator("#context-menu-override").check();
  await page.locator("#context-menu-profile").selectOption("local");
  await feed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: My tools (Override)");
  await page.locator("#context-menu-override").uncheck();
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Player (selected by server)");
  await page.evaluate(() => window.DomeBridge.onSessionChange("disconnected"));
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Player (Fallback)");
  await page.evaluate(() => window.DomeBridge.onSessionChange("connected"));
  await page.locator("#context-menu-json").fill("{");
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toContainText("Previous valid");
  await page.locator("#button-client-options-close").click();
  await feed(page, "#123\n");
  const row = page.locator("#lineBuffer [data-output-id]").last();
  await expect.poll(async () => { await rightText(page, row); return page.getByRole("menuitem", { name: "My verb list" }).count(); }).toBe(1);
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
  await page.getByRole("menuitem", { name: "My verb list" }).click();
  expect(await page.evaluate(() => window.contextSent)).toEqual([["input", "@verbs #123"]]);
  await page.reload();
  await page.evaluate(() => window.outputTest.client.contextMenus.ready);
  expect(await page.evaluate(() => window.outputTest.client.contextMenus.preferences.profile)).toBe("local");
  expect(await page.evaluate(() => window.outputTest.client.contextMenus.active().source)).toBe("Fallback");
});

test("context menus: keyboard actions work in secondary and detached output", async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.outputTest.manager.updateSettings({ open: true, selected: ["team-chat"] }));
  await feed(page, "[-][Team-Chat] #123\n");
  const row = page.locator("#secondaryBuffer [data-output-id]").last();
  await expect(row).toBeVisible();
  await expect.poll(async () => {
    await row.focus();
    await page.keyboard.press("Shift+F10");
    return page.getByRole("menuitem", { name: "Copy object reference" }).count();
  }).toBe(1);
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#123");
  const popupPromise = page.waitForEvent("popup");
  await page.locator("#button-output-popout").click();
  const popup = await popupPromise;
  const detached = popup.locator("#secondaryBuffer [data-output-id]").last();
  await expect(detached).toBeVisible();
  await expect.poll(async () => {
    await detached.focus();
    await popup.keyboard.press("Shift+F10");
    return popup.getByRole("menuitem", { name: "Copy object reference" }).count();
  }).toBe(1);
  await popup.keyboard.press("Enter");
  await expect.poll(() => popup.evaluate(() => window.contextCopied)).toBe("#123");
  const selected = await detached.textContent();
  await detached.evaluate((element) => {
    element.focus();
    document.getSelection().selectAllChildren(element);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await openSelection(popup);
  await popup.getByRole("menuitem", { name: "Copy selected text" }).click();
  await expect.poll(() => popup.evaluate(() => window.contextCopied)).toBe(selected);
  await openSelection(popup);
  const scratch = page.waitForEvent("popup");
  await popup.getByRole("menuitem", { name: "Open in Scratchpad" }).click();
  const ide = await scratch;
  await expect(ide.getByText("Unsaved", { exact: true })).toBeVisible();
  await expect.poll(() => ide.evaluate(() => document.querySelector(".ace_editor")?.env.editor.getValue())).toBe(selected);
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
});

test("context menus: selection Scratchpad opens unsaved, warns immediately, and writes only on Save", async ({ page }) => {
  await start(page);
  const first = "@quit\n;selected_text()\n.";
  await feed(page, first + "\n");
  await page.locator("#lineBuffer").evaluate((element) => {
    const rows = element.querySelectorAll("[data-output-id]");
    rows[rows.length - 1].focus();
    const range = document.createRange();
    range.setStart(rows[0], 0);
    range.setEnd(rows[rows.length - 1], rows[rows.length - 1].childNodes.length);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect.poll(async () => {
    await page.keyboard.press("Shift+F10");
    return page.getByRole("menuitem", { name: "Open in Scratchpad" }).count();
  }).toBe(1);
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("menuitem", { name: "Open in Scratchpad" }).click();
  const ide = await popupPromise;
  await expect(ide.getByRole("tab")).toHaveCount(1);
  await expect(ide.getByText("Unsaved", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
  const confirm = ide.waitForEvent("dialog").then(async (dialog) => {
    expect(dialog.message()).toContain("unsaved");
    await dialog.dismiss();
  });
  await ide.getByRole("button", { name: "Close", exact: true }).click();
  await confirm;
  await expect(ide.getByRole("tab")).toHaveCount(1);
  // A second selection creates a separate editor document, not a new MOO record.
  await page.bringToFront();
  await page.evaluate(() => document.getSelection().removeAllRanges());
  await feed(page, "second selection\n");
  await page.locator("#lineBuffer [data-output-id]").last().evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
  await expect.poll(async () => { await page.keyboard.press("Shift+F10"); return page.getByRole("menuitem", { name: "Open in Scratchpad" }).count(); }).toBe(1);
  await page.getByRole("menuitem", { name: "Open in Scratchpad" }).click();
  await expect(ide.getByRole("tab")).toHaveCount(2);
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
  await ide.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.contextSent.length)).toBe(2);
  expect(await page.evaluate(() => window.contextSent)).toEqual([["input", "@scratch Temporary Scratch Pad"], ["input", "second selection\n."]]);
});

test("context menus: real player bundle imports JSON, preserves override through transport reconnect, and deduplicates notices", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await expect(page.locator("#context-menu-profile")).toBeDisabled();
  const config = defaultContextMenus();
  config.profiles.push({ ...config.profiles[0], id: "staff", label: "Programmer" });
  config.profiles.push({ ...config.profiles[0], id: "local", label: "My tools" });
  config.rules[0].actions.push({ id: "show", label: "Inspect verb", type: "game-command", template: "@show ${object}:${verb}" });
  await page.locator("#context-menu-file").setInputFiles({ name: "local-context.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(config)) });
  await expect(page.locator("#context-menu-profile option")).toHaveCount(3);
  await page.locator("#context-menu-file").focus();
  await page.evaluate(() => {
    window.profileNotices = [];
    new window.MutationObserver(() => window.profileNotices.push(document.querySelector("#context-menu-notice").textContent))
      .observe(document.querySelector("#context-menu-notice"), { childList: true });
  });
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"staff\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Programmer (selected by server)");
  await expect(page.locator("#context-menu-notice")).toHaveText("Switched to Programmer context menus.");
  await expect(page.locator("#context-menu-notice")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#context-menu-file")).toBeFocused();
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"staff\"\n");
  const reloaded = structuredClone(config);
  reloaded.profiles.push({ ...config.profiles[0], id: "reload-check", label: "Reload check" });
  await page.locator("#context-menu-json").fill(JSON.stringify(reloaded));
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-profile option")).toHaveCount(4);
  await expect(page.locator("#context-menu-error")).toBeEmpty();
  expect(await page.evaluate(() => window.profileNotices)).toEqual(["Switched to Programmer context menus."]);
  await page.locator("#context-menu-override").check();
  await page.locator("#context-menu-profile").selectOption("local");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: My tools (Override)");
  const connected = (await fixtureState(page)).connections;
  await page.request.post("/fixture/reconnect");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(connected);
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: My tools (Override)");
  await page.locator("#context-menu-override").uncheck();
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Player (Fallback)");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"staff\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Programmer (selected by server)");
  await page.locator("#context-menu-override").check();
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: My tools (Override)");
  await page.locator("#context-menu-override").uncheck();
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Programmer (selected by server)");
  await page.locator("#context-menu-json").fill(JSON.stringify({ ...config, version: 999 }));
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toContainText("Previous valid");
  await page.locator("#button-client-options-close").click();
  await socketFeed(page, "#12\u001b[31m3:look\u001b[0m\n");
  const row = page.locator("#lineBuffer [data-output-id]").last();
  await expect(row).toHaveText("#123:look");
  await expect.poll(async () => { await rightText(page, row, 4); return page.getByRole("menuitem", { name: "Inspect verb" }).count(); }).toBe(1);
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
  await page.getByRole("menuitem", { name: "Inspect verb" }).click();
  await expect.poll(async () => (await fixtureState(page)).commands.slice(initial.commands.length)).toEqual(["@show #123:look"]);
});

test("context menus: pointer positioning, keyboard chooser and native bypass stay inside the viewport", async ({ page }) => {
  await start(page);
  await page.setViewportSize({ width: 420, height: 300 });
  await feed(page, "row\n".repeat(30) + "                              #123\n");
  const row = page.locator("#lineBuffer [data-output-id]").last();
  let point;
  await expect.poll(async () => { point = await rightText(page, row, 31); return page.getByRole("menu").count(); }).toBe(1);
  const bounds = await page.getByRole("menu").boundingBox();
  expect(bounds.x).toBeLessThan(point.x);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(420);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(300);
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
  await page.keyboard.down("Shift");
  await rightText(page, row, 31);
  await page.keyboard.up("Shift");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.evaluate(() => document.getSelection().removeAllRanges());
  await feed(page, "#123 #456.name\n");
  const multiple = page.locator("#lineBuffer [data-output-id]").last();
  await expect.poll(async () => { await multiple.focus(); await page.keyboard.press("Shift+F10"); return page.getByRole("menuitem", { name: "#456.name", exact: true }).count(); }).toBe(1);
  await expect(page.getByRole("menuitem")).toHaveText(["#123", "#456.name"]);
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "#456.name", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Copy property reference" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#456.name");
});

test("context menus: real bundle repeats rows, switches compiled profiles, reloads rules and captures menu styling", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.setViewportSize({ width: 1000, height: 620 });
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  const config = defaultContextMenus();
  config.profiles.push({ id: "objects", label: "Objects only", rules: ["object"] });
  config.rules[0].actions.push({ id: "show", label: "Inspect verb", type: "game-command", template: "@show ${object}:${verb}" });
  config.rules[0].actions.push({ id: "verbs", label: "List object verbs", type: "game-command", template: "@verbs ${object}" });
  await page.locator("#context-menu-file").setInputFiles({ name: "reuse-context.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(config)) });
  await expect(page.locator("#context-menu-profile option")).toHaveCount(2);
  await page.locator("#button-client-options-close").click();
  for (const text of ["#123:look", "#123:look", "#456:look"]) {
    await socketFeed(page, text + "\n");
    const row = page.locator("#lineBuffer [data-output-id]").last();
    await expect(row).toHaveText(text);
    await expect.poll(async () => { await rightText(page, row, 2); return page.getByRole("menuitem", { name: "Inspect verb" }).count(); }).toBe(1);
    await page.keyboard.press("Escape");
  }
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"objects\"\n#123:look\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Objects only (selected by server)");
  const switched = page.locator("#lineBuffer [data-output-id]").last();
  await expect.poll(async () => { await rightText(page, switched, 2); return page.getByRole("menuitem", { name: "Copy object reference", exact: true }).count(); }).toBe(1);
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Player (selected by server)");
  await expect.poll(async () => { await rightText(page, switched, 2); return page.getByRole("menuitem", { name: "Inspect verb" }).count(); }).toBe(1);
  await page.keyboard.press("Escape");
  config.rules[0].pattern = "(?<object>#[0-9]+):(?<verb>inspect)";
  config.profiles.push({ ...config.profiles[0], id: "reloaded", label: "Reload marker" });
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await page.locator("#context-menu-json").fill(JSON.stringify(config));
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-profile option")).toHaveCount(3);
  await page.locator("#button-client-options-close").click();
  await expect.poll(async () => { await rightText(page, switched, 2); return page.getByRole("menuitem", { name: "Copy object reference", exact: true }).count(); }).toBe(1);
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await socketFeed(page, "\nLocal synthetic preview — no game connection\nObject: #123\nProperty: #123.name\nVerb: #12\u001b[36m3:inspect\u001b[0m\n");
  const preview = page.locator("#lineBuffer [data-output-id]").last();
  await expect(preview).toHaveText("Verb: #123:inspect");
  await expect.poll(async () => { await rightText(page, preview, 9); return page.getByRole("menuitem", { name: "Inspect verb" }).count(); }).toBe(1);
  await expect(page.getByRole("menuitem")).toHaveText(["Copy verb reference", "Inspect verb", "List object verbs"]);
  const directory = "tmp/context-menu-review";
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const screenshot = directory + "/open-reference-menu.png";
  await page.screenshot({ path: screenshot });
  await chmod(screenshot, 0o600);
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
});

test("context menus: real player bundle selection opens the existing IDE without a write until explicit Save", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const selected = "#123:look\n@quit";
  await socketFeed(page, selected + "\n");
  const last = page.locator("#lineBuffer [data-output-id]").last();
  await expect(last).toHaveText("@quit");
  await page.locator("#lineBuffer").evaluate((element) => {
    const rows = element.querySelectorAll("[data-output-id]");
    rows[rows.length - 1].focus();
    document.getSelection().setBaseAndExtent(rows[0], 0, rows[rows.length - 1], rows[rows.length - 1].childNodes.length);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await openSelection(page);
  const popup = page.waitForEvent("popup");
  await page.getByRole("menuitem", { name: "Open in Scratchpad" }).click();
  const ide = await popup;
  await expect(ide.getByText("Unsaved", { exact: true })).toBeVisible();
  await expect.poll(() => ide.evaluate(() => document.querySelector(".ace_editor")?.env.editor.getValue())).toBe(selected);
  const hoverPoint = await ide.evaluate(() => {
    const editor = document.querySelector(".ace_editor").env.editor;
    const point = editor.renderer.textToScreenCoordinates(0, 6);
    return { x: point.pageX - window.scrollX, y: point.pageY - window.scrollY + editor.renderer.lineHeight / 2 };
  });
  await ide.mouse.move(hoverPoint.x, hoverPoint.y);
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
  await ide.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).commands.slice(initial.commands.length)).toEqual(["@scratch Temporary Scratch Pad", selected + "\n."]);
});

test("context menus: reverse 2000-line virtual selection copies partial endpoints and opens the same unsaved scratchpad text", async ({ page }) => {
  await start(page, { clipboardStub: false });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await feed(page, Array.from({ length: 2000 }, (_, index) => "selected history line " + index).join("\n") + "\n");
  await page.evaluate(() => {
    const view = window.outputTest.manager.views.main;
    view.setPaused(true);
    view.element.focus({ preventScroll: true });
    const row = view.mounted.get(2000);
    window.selectionAnchor = row.firstChild;
    document.getSelection().setBaseAndExtent(row.firstChild, 2, row.firstChild, 8);
  });
  await page.locator("#lineBuffer").hover();
  await page.mouse.wheel(0, -5000);
  await expect.poll(() => page.evaluate(() => Math.min(...window.outputTest.manager.views.main.mounted.keys()))).toBeLessThan(1800);
  expect(await page.evaluate(() => window.selectionAnchor.isConnected)).toBe(true);
  expect(await page.locator("[data-output-id]").count()).toBeLessThan(400);
  const expected = await page.evaluate(() => {
    const view = window.outputTest.manager.views.main;
    const top = view.index.offsetIndex(view.logicalTop());
    const row = view.mounted.get(view.index.at(top).id);
    document.getSelection().setBaseAndExtent(window.selectionAnchor, 8, row.firstChild, 2);
    document.dispatchEvent(new Event("selectionchange"));
    const parts = [];
    for (let id = Number(row.dataset.outputId); id <= 2000; id++) parts.push("selected history line " + (id - 1));
    parts[0] = parts[0].slice(2);
    parts[parts.length - 1] = parts[parts.length - 1].slice(0, 8);
    return parts.join("\n");
  });
  await openSelection(page);
  await page.getByRole("menuitem", { name: "Copy selected text" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  await openSelection(page);
  const popup = page.waitForEvent("popup");
  await page.getByRole("menuitem", { name: "Open in Scratchpad" }).click();
  const ide = await popup;
  await expect(ide.getByRole("tab")).toHaveCount(1);
  await expect(ide.getByText("Unsaved", { exact: true })).toBeVisible();
  await expect.poll(() => ide.evaluate(() => document.querySelector(".ace_editor")?.env.editor.getValue())).toBe(expected);
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
});

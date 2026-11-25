/* global window, document, NodeFilter */
import { test, expect } from "@playwright/test";
import { mkdir, chmod, readFile } from "node:fs/promises";
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
  await expect.poll(async () => { await rightText(page, row); return page.getByRole("menuitem", { name: "Copy to Clipboard" }).count(); }).toBe(1);
  await page.getByRole("menuitem", { name: "Copy to Clipboard" }).click();
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#123:look");
  await expect.poll(async () => { await rightText(page, row, 10); return page.getByRole("menuitem", { name: "Copy to Clipboard" }).count(); }).toBe(1);
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
    return page.getByRole("menuitem", { name: "Copy to Clipboard" }).count();
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
    return popup.getByRole("menuitem", { name: "Copy to Clipboard" }).count();
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

test("context menus: profile notice is a centered translucent overlay without stealing focus or clicks", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const notice = page.locator("#context-menu-notice");
  await expect(notice).toBeHidden();
  await expect(notice).toHaveCSS("visibility", "visible");
  await page.locator("#inputBuffer").focus();
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\n");
  await expect(notice).toHaveText("Switched to Programmer context menus.");
  await expect(notice).toHaveAttribute("aria-live", "polite");
  for (const viewport of [{ width: 1000, height: 620 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(notice).toBeVisible();
    const rect = await notice.boundingBox();
    expect(Math.abs(rect.x + rect.width / 2 - viewport.width / 2)).toBeLessThan(1);
    expect(Math.abs(rect.y + rect.height / 2 - viewport.height / 2)).toBeLessThan(1);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
    const style = await notice.evaluate((element) => {
      const css = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { position: css.position, background: css.backgroundColor, pointerEvents: css.pointerEvents, intercepts: element === target || element.contains(target) };
    });
    expect(style.position).toBe("fixed");
    expect(style.background).toBe("rgba(37, 65, 94, 0.9)");
    expect(style.pointerEvents).toBe("none");
    expect(style.intercepts).toBe(false);
    await expect(page.locator("#inputBuffer")).toBeFocused();
    if (viewport.width === 1000) {
      await mkdir("tmp/context-menu-review", { recursive: true, mode: 0o700 });
      const path = "tmp/context-menu-review/profile-notice-" + page.context().browser().browserType().name() + ".png";
      await page.screenshot({ path });
      await chmod(path, 0o600);
    }
  }
  await expect(notice).toBeEmpty({ timeout: 6000 });
  await expect(notice).toBeHidden();
  await expect(notice).toHaveCSS("visibility", "visible");
});

test("context menus: Programmer override opens reference actions on the first right-click without automatic selection", async ({ page }) => {
  await page.context().addInitScript(() => {
    window.contextMatchedRows = new Set();
    window.contextEvents = [];
    const post = window.Worker.prototype.postMessage;
    window.Worker.prototype.postMessage = function(message, ...args) {
      if (message.type === "match") {
        const receive = ({ data }) => {
          if (data.id !== message.id) return;
          window.contextMatchedRows.add(message.text);
          this.removeEventListener("message", receive);
        };
        this.addEventListener("message", receive);
      }
      return post.call(this, message, ...args);
    };
    window.addEventListener("contextmenu", (event) => {
      window.setTimeout(() => window.contextEvents.push({ prevented: event.defaultPrevented }), 0);
    }, true);
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await expect(page.locator("#context-menu-profile option")).toHaveCount(3);
  await page.locator("#context-menu-override").check();
  await page.locator("#context-menu-profile").selectOption("programmer");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Programmer (Override)");
  await page.locator("#button-client-options-close").click();
  const objects = ["@show", "Name and Number", "@verbs", "@props", "@parents", "@kids", "@siblings", "@tree", "Look", "Copy to Clipboard"];
  const verbs = ["@edit", "@show", "@args", "help", "Copy to Clipboard"];
  const properties = ["@edit", "@show", "Copy to Clipboard"];
  for (const [reference, ansi, labels] of [
    ["#123", "#123", objects],
    ["#123:inspect", "#12\u001b[31m3:inspect\u001b[0m", verbs],
    ["#123.name", "#123.name", properties],
    ["$object", "$object", objects],
    ["$object:inspect", "$object:inspect", verbs],
    ["$object.name", "$ob\u001b[32mject.name\u001b[0m", properties]
  ]) {
    await socketFeed(page, "Target " + ansi + "\n");
    const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Target " + reference }).last();
    await row.waitFor();
    await page.waitForFunction((text) => window.contextMatchedRows.has(text), "Target " + reference);
    await expect(row.locator(".all-copy").first()).toHaveCSS("user-select", "text");
    expect(await page.evaluate(() => document.getSelection().isCollapsed)).toBe(true);
    await page.evaluate(() => { window.contextEvents = []; });
    await rightText(page, row, 9);
    await expect(page.getByRole("menuitem")).toHaveText(labels);
    await expect.poll(() => page.evaluate(() => window.contextEvents)).toEqual([{ prevented: true }]);
    expect(await page.evaluate(() => document.getSelection().isCollapsed)).toBe(true);
    expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
    await page.keyboard.press("Escape");
  }
  const selected = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Target #123" }).first();
  await selected.evaluate((element) => {
    const node = element.querySelector(".all-copy").firstChild;
    const range = document.createRange();
    range.setStart(node, 1);
    range.setEnd(node, 3);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.focus();
    document.dispatchEvent(new Event("selectionchange"));
  });
  expect(await page.evaluate(() => document.getSelection().toString())).toBe("12");
  await openSelection(page);
  await expect(page.getByRole("menuitem")).toHaveText(["Copy selected text", "Open in Scratchpad"]);
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
  await expect(page.locator("#context-menu-profile option")).toHaveCount(5);
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
  await expect(page.locator("#context-menu-profile option")).toHaveCount(6);
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
  await expect(page.getByRole("menuitem", { name: "Copy to Clipboard" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#456.name");
});

test("context menus: shipped role files expose exact actions and copy only matched reference text", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\nObject #123\nVerb #12\u001b[31m3:look\u001b[0m\nProperty #123.name\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Programmer (selected by server)");
  const object = page.locator("#lineBuffer [data-output-id]").filter({ hasText: /^Object / }).last();
  const verb = page.locator("#lineBuffer [data-output-id]").filter({ hasText: /^Verb / }).last();
  const property = page.locator("#lineBuffer [data-output-id]").filter({ hasText: /^Property / }).last();
  const open = async (row, offset, labels) => {
    await expect.poll(async () => { await rightText(page, row, offset); return page.getByRole("menuitem").allTextContents(); }).toEqual(labels);
  };
  const programmerObjects = ["@show", "Name and Number", "@verbs", "@props", "@parents", "@kids", "@siblings", "@tree", "Look", "Copy to Clipboard"];
  await open(object, 8, programmerObjects);
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
  await page.getByRole("menuitem", { name: "Name and Number", exact: true }).click();
  await open(object, 8, programmerObjects);
  await page.getByRole("menuitem", { name: "@kids", exact: true }).click();
  await open(verb, 7, ["@edit", "@show", "@args", "help", "Copy to Clipboard"]);
  await page.getByRole("menuitem", { name: "@args", exact: true }).click();
  await open(property, 11, ["@edit", "@show", "Copy to Clipboard"]);
  await page.getByRole("menuitem", { name: "@show", exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([";$string_utils:nn(#123)", "@kids #123 -lcd", "@args #123:look", "@show #123.name"]);
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: GM (selected by server)");
  await open(object, 8, ["@parents", "@kids", "@notes", "Look", "Copy to Clipboard"]);
  await page.getByRole("menuitem", { name: "@kids", exact: true }).click();
  for (const [row, offset, expected] of [[verb, 7, "#123:look"], [property, 11, "#123.name"]]) {
    await open(row, offset, ["Copy to Clipboard"]);
    await page.getByRole("menuitem", { name: "Copy to Clipboard", exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  }
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Player (selected by server)");
  for (const [row, offset, expected] of [[object, 8, "#123"], [verb, 7, "#123:look"], [property, 11, "#123.name"]]) {
    await open(row, offset, ["Copy to Clipboard"]);
    await page.getByRole("menuitem", { name: "Copy to Clipboard", exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  }
  await object.evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
  await openSelection(page);
  await expect(page.getByRole("menuitem")).toHaveText(["Copy selected text", "Open in Scratchpad"]);
  await page.getByRole("menuitem", { name: "Copy selected text" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Object #123");
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([";$string_utils:nn(#123)", "@kids #123 -lcd", "@args #123:look", "@show #123.name", "@kids #123"]);
});

test("context menus: real bundle numeric and symbolic commands, Look and traceback Copy Frame stay explicit", async ({ page }) => {
  const frameFixture = JSON.parse(await readFile(new URL("../test-support/fixtures/context-menu-frames.json", import.meta.url), "utf8"));
  const initial = await fixtureState(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Programmer (selected by server)");
  const sent = [];
  const open = async (row, index, labels) => {
    await expect.poll(async () => { await rightText(page, row, index); return page.getByRole("menuitem").allTextContents(); }).toEqual(labels);
  };
  for (const object of ["#123", "$object"]) {
    for (const [suffix, labels, commands] of [
      ["", ["@show", "Name and Number", "@verbs", "@props", "@parents", "@kids", "@siblings", "@tree", "Look"], ["@show " + object, ";$string_utils:nn(" + object + ")", "@verbs " + object, "@props " + object, "@parents " + object, "@kids " + object + " -lcd", "@siblings " + object, "@tree " + object, "look " + object]],
      [":inspect", ["@edit", "@show", "@args", "help"], ["@edit " + object + ":inspect", "@show " + object + ":inspect", "@args " + object + ":inspect", "help " + object + ":inspect"]],
      [".name", ["@edit", "@show"], ["@edit " + object + ".name", "@show " + object + ".name"]]
    ]) {
      const reference = object + suffix;
      await socketFeed(page, "Reference " + object.slice(0, 2) + "\u001b[32m" + object.slice(2) + suffix + "\u001b[0m\n");
      const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Reference " + reference }).last();
      for (let index = 0; index < labels.length; index++) {
        await open(row, 11, [...labels, "Copy to Clipboard"]);
        expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual(sent);
        await page.getByRole("menuitem", { name: labels[index], exact: true }).click();
        sent.push(commands[index]);
        await expect.poll(async () => (await fixtureState(page)).commands.slice(initial.commands.length)).toEqual(sent);
      }
      await open(row, 11, [...labels, "Copy to Clipboard"]);
      await page.getByRole("menuitem", { name: "Copy to Clipboard", exact: true }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(reference);
    }
  }
  for (const frame of frameFixture.frames) {
    await socketFeed(page, frame.replace(":", "\u001b[31m:\u001b[0m") + "\n");
    const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: frame }).last();
    await open(row, frame.indexOf(":") + 2, ["Copy Frame"]);
    await page.keyboard.press("Escape");
    await row.evaluate((element) => { document.getSelection().removeAllRanges(); element.focus(); });
    await expect.poll(async () => { await page.keyboard.press("Shift+F10"); return page.getByRole("menuitem").allTextContents(); }).toEqual(["Copy Frame"]);
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(frame);
    expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual(sent);
    await row.evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
    await openSelection(page);
    await expect(page.getByRole("menuitem")).toHaveText(["Copy selected text", "Open in Scratchpad"]);
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.getSelection().removeAllRanges());
  }
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\nGM #123\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: GM (selected by server)");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "GM #123" }).last();
  await open(row, 5, ["@parents", "@kids", "@notes", "Look", "Copy to Clipboard"]);
  await page.getByRole("menuitem", { name: "Look", exact: true }).click();
  sent.push("look #123");
  await expect.poll(async () => (await fixtureState(page)).commands.slice(initial.commands.length)).toEqual(sent);
});

test("context menus: missing and invalid role files fall back and recover on Options reload", async ({ page }) => {
  let missingGM = true;
  let invalidProgrammer = true;
  let pauseGM = false;
  let releaseGM;
  await page.route("**/profiles/gm.json", async (route) => {
    if (pauseGM) await new Promise((resolve) => { releaseGM = resolve; });
    if (missingGM) await route.fulfill({ status: 404, body: "Missing test fixture" });
    else await route.continue();
  });
  await page.route("**/profiles/programmer.json", (route) => invalidProgrammer ? route.fulfill({ contentType: "application/json", body: "{" }) : route.continue());
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\n");
  await expect(page.locator("#context-menu-error")).toContainText("gm");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Player (Fallback)");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\n");
  await expect(page.locator("#context-menu-error")).toContainText("programmer");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Player (Fallback)");
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toContainText("Previous valid");
  missingGM = false;
  invalidProgrammer = false;
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toBeEmpty();
  await expect(page.locator("#context-menu-profile option")).toHaveCount(3);
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Programmer (selected by server)");
  await page.locator("#context-menu-override").check();
  await page.locator("#context-menu-profile").selectOption("gm");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: GM (Override)");
  await page.locator("#context-menu-override").uncheck();
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Player (selected by server)");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: GM (selected by server)");
  missingGM = true;
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Player (Fallback)");
  missingGM = false;
  pauseGM = true;
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\n");
  await expect.poll(() => typeof releaseGM).toBe("function");
  await socketFeed(page, "#$# SDWC%%CONTEXT-RESET\n");
  const lateResponse = page.waitForResponse((response) => response.url().endsWith("/profiles/gm.json"));
  pauseGM = false;
  releaseGM();
  await (await lateResponse).finished();
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active profile: Player (selected by server)");
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
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
  await expect(page.locator("#context-menu-profile option")).toHaveCount(4);
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
  await expect.poll(async () => { await rightText(page, switched, 2); return page.getByRole("menuitem", { name: "Copy to Clipboard", exact: true }).count(); }).toBe(1);
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
  await expect(page.locator("#context-menu-profile option")).toHaveCount(5);
  await page.locator("#button-client-options-close").click();
  await expect.poll(async () => { await rightText(page, switched, 2); return page.getByRole("menuitem", { name: "Copy to Clipboard", exact: true }).count(); }).toBe(1);
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await socketFeed(page, "\nLocal synthetic preview — no game connection\nObject: #123\nProperty: #123.name\nVerb: #12\u001b[36m3:inspect\u001b[0m\n");
  const preview = page.locator("#lineBuffer [data-output-id]").last();
  await expect(preview).toHaveText("Verb: #123:inspect");
  await expect.poll(async () => { await rightText(page, preview, 9); return page.getByRole("menuitem", { name: "Inspect verb" }).count(); }).toBe(1);
  await expect(page.getByRole("menuitem")).toHaveText(["Copy to Clipboard", "Inspect verb", "List object verbs"]);
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

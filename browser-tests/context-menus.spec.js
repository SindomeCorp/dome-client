/* global window, document, NodeFilter */
import { test, expect } from "@playwright/test";
import { mkdir, chmod, readFile } from "node:fs/promises";
import { defaultContextMenus } from "../src/shared/context-menus.js";
import { referenceContextMenus } from "../test-support/context-menu-reference-fixture.js";
import { CONTEXT_UNDERLINE } from "../src/client/features/context-menus/underlines.js";

async function underlinedText(row) {
  return row.evaluate((element, name) => [...(window.CSS.highlights.get(name) || [])].filter((range) => element.contains(range.startContainer)).map((range) => range.toString()).join(""), CONTEXT_UNDERLINE);
}

async function setContextSection(page, section) {
  await page.locator("#context-menu-tab-" + section).click();
}

async function start(page, { clipboardStub = true } = {}) {
  if (clipboardStub) await page.context().addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(text) { window.contextCopied = text; } } });
  });
  await page.context().addInitScript((config) => { if (!window.localStorage.getItem("dc-context-menus")) window.localStorage.setItem("dc-context-menus", JSON.stringify(config)); }, referenceContextMenus());
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
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-json").fill(JSON.stringify(value, null, 2));
  await setContextSection(page, "advanced");
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
    return page.getByRole("menuitem", { name: "Copy selected text" }).count();
  }).toBe(1);
}

async function fixtureState(page) {
  return (await page.request.get("/fixture/state")).json();
}

async function socketFeed(page, text) {
  await page.request.post("/fixture/data", { data: { text } });
}

async function expectClipboard(page, expected) {
  if (page.context().browser().browserType().name() === "chromium") {
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    return;
  }
  // Paste in a separate page: touching the source DOM selection would discard
  // the virtual buffer's retained, unmounted selection endpoints.
  const verifier = await page.context().newPage();
  try {
    await verifier.setContent("<textarea id=\"context-clipboard-check\"></textarea>");
    await verifier.locator("textarea").focus();
    await verifier.keyboard.press("Control+v");
    await expect(verifier.locator("textarea")).toHaveValue(expected);
  } finally { await verifier.close(); await page.bringToFront(); }
}

test("context menus: admin disable and unusable JSON retain native menus despite saved local overrides", async ({ page }) => {
  await page.context().addInitScript((config) => {
    window.localStorage.setItem("dc-context-menus", JSON.stringify(config));
    window.localStorage.setItem("dc-context-menus-preferences", JSON.stringify({ override: true, profile: "programmer", underline: true }));
    window.nativeContextEvents = [];
    document.addEventListener("contextmenu", (event) => window.nativeContextEvents.push(event.defaultPrevented));
  }, defaultContextMenus());
  const requests = [];
  const workers = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/profiles/")) requests.push(request.url()); });
  page.on("worker", (worker) => workers.push(worker.url()));
  for (const mode of ["off", "missing", "invalid", "zero"]) {
    const initial = await fixtureState(page);
    await page.goto("/?entry=real&context=" + mode);
    await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
    const connected = await fixtureState(page);
    await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\r\nSynthetic #123:look\r\n");
    const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Synthetic #123:look" });
    await expect(row).toBeVisible();
    await expect(page.locator("#inputBuffer")).toBeVisible();
    await page.locator("#button-client-options").click();
    await expect(page.locator("#client-options-tab-context")).toHaveCount(0);
    await expect(page.locator("#context-menu-json")).toHaveCount(0);
    await page.locator("#button-client-options-close").click();
    await rightText(page, row, 11);
    await expect.poll(() => page.evaluate(() => window.nativeContextEvents)).toEqual([false]);
    await page.keyboard.press("Escape");
    await row.evaluate((element) => { element.tabIndex = 0; element.focus(); });
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.locator("#context-menu-notice")).toHaveCount(0);
    expect(await page.evaluate(() => window.CSS.highlights?.has("dome-context-targets") || false)).toBe(false);
    expect((await fixtureState(page)).commands).toEqual(connected.commands);
    await page.keyboard.press("Escape");
  }
  expect(requests).toEqual([]);
  expect(workers).toEqual([]);
});

test("context menus: shipped Player leaves object references native and unhighlighted, with selected-text Copy only", async ({ page }) => {
  await page.context().addInitScript(() => {
    window.localStorage.setItem("dc-context-menus-preferences", JSON.stringify({ underline: true }));
    window.playerContextEvents = [];
    document.addEventListener("contextmenu", (event) => window.playerContextEvents.push(event.defaultPrevented));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(text) { window.contextCopied = text; } } });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");
  const text = "Player #123:look #123.name $object:look $object.name";
  await socketFeed(page, "Player #12\u001b[31m3:look\u001b[0m #123.name $object:look $object.name\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: text }).last();
  await expect(row).toBeVisible();
  for (const offset of [8, 18, 28, 41]) {
    await rightText(page, row, offset);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  expect(await page.evaluate(() => window.playerContextEvents)).toEqual([false, false, false, false]);
  expect(await underlinedText(row)).toBe("");
  expect(await page.evaluate(() => document.getSelection().isCollapsed)).toBe(true);
  await row.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await row.evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
  await expect.poll(async () => { await page.keyboard.press("Shift+F10"); return page.getByRole("menuitem").allTextContents(); }).toEqual(["Copy selected text"]);
  await page.getByRole("menuitem", { name: "Copy selected text" }).click();
  expect(await page.evaluate(() => window.contextCopied)).toBe(text);
  await page.evaluate(() => document.getSelection().removeAllRanges());
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: GM (selected by server)");
  await expect.poll(() => underlinedText(row)).toBe("#123:look#123.name");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (selected by server)");
  await expect.poll(() => underlinedText(row)).toBe("");
  expect((await fixtureState(page)).commands).toEqual(connected.commands);
});

test("context menus: login profile markers preserve output boundaries across coalesced and fragmented packets", async ({ page }) => {
  const fixture = JSON.parse(await readFile(new URL("../test-support/fixtures/context-profile-login.json", import.meta.url), "utf8"));
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await expect(page.locator("#context-menu-profile option")).toHaveCount(3);
  const connected = await fixtureState(page);
  const user = "#$# user-type " + fixture.userType;
  const profile = "#$# SDWC%%CONTEXT-PROFILE%%" + JSON.stringify(fixture.profile);
  const packets = [
    { chunks: [fixture.notice + "\r\n" + user + "\r\n" + profile + "\r\n" + fixture.after + "\r\n"] },
    { chunks: [fixture.notice + "\r\n", user + "\r\n" + profile + "\r\n", fixture.after + "\r\n"] },
    { chunks: [fixture.notice + "\r", "\n" + user + "\r", "\n" + profile.slice(0, 26), profile.slice(26) + "\r", "\n" + fixture.after + "\r", "\n"] },
    { chunks: [fixture.notice + "\r\n", "\r\n" + user + "\r\n" + profile + "\r\n" + fixture.after + "\r\n"], blankLines: 1 }
  ];
  for (const [index, { chunks, blankLines = 0 }] of packets.entries()) {
    await socketFeed(page, "#$# SDWC%%CONTEXT-RESET\r\n");
    await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");
    const before = await page.locator("#lineBuffer [data-output-id]").count();
    for (const chunk of chunks) await socketFeed(page, chunk);
    await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
    const notice = page.locator("#lineBuffer [data-output-id]").filter({ hasText: fixture.notice });
    const after = page.locator("#lineBuffer [data-output-id]").filter({ hasText: fixture.after });
    await expect(notice).toHaveCount(index + 1);
    await expect(after).toHaveCount(index + 1);
    await expect(notice.last()).toHaveText(fixture.notice);
    await expect(after.last()).toHaveText(fixture.after);
    await expect(page.locator("#lineBuffer [data-output-id]")).toHaveCount(before + 2 + blankLines);
    await expect(page.locator("#lineBuffer")).not.toContainText("CONTEXT-PROFILE");
    await expect(page.locator("#lineBuffer")).not.toContainText("user-type");
    await expect.poll(async () => { await rightText(page, after.last(), fixture.after.indexOf("inspect")); return page.getByRole("group").count(); }).toBe(2);
    await expect(page.getByRole("group", { name: "Verb #123:inspect", exact: true }).getByRole("menuitem", { name: "@list", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    expect((await fixtureState(page)).commands).toEqual(connected.commands);
  }
});

test("context menus: wildcard channel tags rewind in every profile only after explicit activation", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  const sent = [];
  for (const id of ["player", "gm", "programmer"]) {
    await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%" + JSON.stringify(id) + "\r\n");
    await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: " + ({ player: "Player", gm: "GM", programmer: "Programmer" })[id] + " (selected by server)");
    for (const sign of ["-", "+"]) for (const name of ["Login-Watcher", "Bit-Chat", "SIC-COMM", "SIC-PM", "Any channel 42", "quotes \"; ${object}"]) {
      const tag = "[" + sign + "][" + name + "]";
      await socketFeed(page, "Tag [" + sign + "][" + name.slice(0, 2) + "\u001b[32m" + name.slice(2) + "\u001b[0m] synthetic text\r\n");
      const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Tag " + tag + " synthetic text" }).last();
      await expect(row).toBeVisible();
      await expect.poll(async () => { await rightText(page, row, 10); return page.getByRole("menuitem").allTextContents(); }).toEqual(["@rewind"]);
      expect((await fixtureState(page)).commands.slice(connected.commands.length)).toEqual(sent);
      await page.getByRole("menuitem", { name: "@rewind", exact: true }).click();
      sent.push("@rewind " + name);
      await expect.poll(async () => (await fixtureState(page)).commands.slice(connected.commands.length)).toEqual(sent);
    }
    const row = page.locator("#lineBuffer [data-output-id]").last();
    await row.focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menuitem")).toHaveText(["@rewind"]);
    await page.keyboard.press("Escape");
    await row.evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
    await openSelection(page);
    await expect(page.getByRole("menuitem")).toHaveText(id === "player" ? ["Copy selected text"] : ["Copy selected text", "Open in Scratchpad"]);
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.getSelection().removeAllRanges());
    expect((await fixtureState(page)).commands.slice(connected.commands.length)).toEqual(sent);
  }
});

test("context menus: Basic is default, Advanced holds JSON tools and automatic fallback ignores legacy choices", async ({ page }) => {
  await page.context().addInitScript(() => {
    window.localStorage.setItem("dc-context-menus-preferences", JSON.stringify({ override: false, profile: "gm", fallback: "gm" }));
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  const basic = page.locator("#context-menu-tab-basic");
  const advanced = page.locator("#context-menu-tab-advanced");
  await expect(basic).toHaveAttribute("aria-selected", "true");
  for (const [tab, reference] of [[basic, "#presentation-tab-main"], [advanced, "#presentation-tab-secondary"]]) {
    const properties = ["backgroundColor", "color", "borderTopColor", "borderTopWidth", "borderRadius", "padding", "fontFamily", "fontSize"];
    const readStyle = (element, properties) => {
      const style = window.getComputedStyle(element);
      return Object.fromEntries(properties.map((property) => [property, style[property]]));
    };
    expect(await tab.evaluate(readStyle, properties)).toEqual(await page.locator(reference).evaluate(readStyle, properties));
  }
  const tabsBox = await page.locator(".context-menu-tabs").boundingBox();
  const labelBox = await page.locator("#context-menu-active").boundingBox();
  expect(tabsBox.y + tabsBox.height).toBeLessThanOrEqual(labelBox.y);
  await mkdir("tmp/context-menu-review", { recursive: true, mode: 0o700 });
  const screenshot = "tmp/context-menu-review/context-options-basic-" + page.context().browser().browserType().name() + ".png";
  await page.screenshot({ path: screenshot });
  await chmod(screenshot, 0o600);
  await expect(page.locator("#context-menu-fallback")).toHaveCount(0);
  await expect(page.locator("#context-menu-json")).toBeHidden();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");
  await expect(page.locator("#context-menu-active")).toHaveCSS("font-weight", "700");
  await expect(page.getByText("Right click on text to show a context menu with options. Use Shift+F10 on a focused output row for keyboard access. Shift-right-click keeps the browser menu.", { exact: true })).toBeVisible();
  await basic.focus();
  await page.keyboard.press("ArrowRight");
  await expect(advanced).toBeFocused();
  await expect(advanced).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#context-menu-json")).toBeVisible();
  await expect(page.locator("#context-menu-file")).toBeVisible();
  await expect(page.locator("#context-menu-export")).toBeVisible();
  await expect(page.locator("#context-menu-override")).toBeHidden();
  await page.locator("#context-menu-json").fill("{");
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toContainText("Previous valid");
  await advanced.focus();
  await page.keyboard.press("Home");
  await expect(basic).toBeFocused();
  await expect(page.locator("#context-menu-json")).toBeHidden();
  await page.locator("#context-menu-override").check();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: GM (Override)");
  await page.locator("#context-menu-override").uncheck();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");
  expect(await page.evaluate(() => Object.hasOwn(JSON.parse(window.localStorage.getItem("dc-context-menus-preferences")), "fallback"))).toBe(false);
});

test("context menus: an empty available registry disables menus and can recover through Advanced", async ({ page }) => {
  await page.context().addInitScript(() => {
    window.localStorage.setItem("dc-context-menus", JSON.stringify({ version: 1, rules: [], profiles: [] }));
    window.disabledContextEvents = [];
    window.addEventListener("contextmenu", (event) => window.setTimeout(() => window.disabledContextEvents.push(event.defaultPrevented), 0), true);
  });
  await page.route("**/profiles/*.json", (route) => route.fulfill({ status: 404, body: "Synthetic unavailable profile" }));
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Disabled (no profiles available)");
  await socketFeed(page, "Existing #123\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Existing #123" }).last();
  await expect(row).toBeVisible();
  await rightText(page, row, 11);
  await expect.poll(() => page.evaluate(() => window.disabledContextEvents)).toEqual([false]);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await expect(page.locator("#context-menu-override")).toBeDisabled();
  await expect(page.locator("#context-menu-profile")).toBeDisabled();
  await setContextSection(page, "advanced");
  await page.unroute("**/profiles/*.json");
  await page.locator("#context-menu-json").fill(JSON.stringify(defaultContextMenus()));
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toBeEmpty();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");
  await setContextSection(page, "basic");
  await expect(page.locator("#context-menu-override")).toBeEnabled();
});

test("context menus: optional underlines follow active regex rules without changing selection or first-click menus", async ({ page }) => {
  await page.context().addInitScript((config) => { if (!window.localStorage.getItem("dc-context-menus")) window.localStorage.setItem("dc-context-menus", JSON.stringify(config)); }, referenceContextMenus());
  await page.context().addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(text) { window.contextCopied = text; } } });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const text = "Markers #123:look #456.name $object:inspect $object.name https://example.test/#777";
  await socketFeed(page, "Markers #12\u001b[31m3:look\u001b[0m #456.name $object:inspect $object.name https://example.test/#777\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: text }).last();
  await expect(row).toBeVisible();
  const html = await row.innerHTML();
  expect(await underlinedText(row)).toBe("");
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  const underline = page.locator("#context-menu-underline");
  await expect(underline).not.toBeChecked();
  await expect(underline).toBeEnabled();
  await underline.check();
  await page.locator("#button-client-options-close").click();
  await expect.poll(() => underlinedText(row)).toBe("#123:look#456.name");
  expect(await row.innerHTML()).toBe(html);
  expect(await row.evaluate((element, name) => window.getComputedStyle(element, "::highlight(" + name + ")").textDecorationLine, CONTEXT_UNDERLINE)).toBe("underline");
  await rightText(page, row, 10);
  await expect(page.getByRole("menuitem")).toHaveText(["Copy to Clipboard"]);
  await page.getByRole("menuitem", { name: "Copy to Clipboard", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#123:look");
  expect(await page.evaluate(() => document.getSelection().isCollapsed)).toBe(true);
  await row.evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await underline.uncheck();
  await page.locator("#button-client-options-close").click();
  await expect.poll(() => underlinedText(row)).toBe("");
  expect(await page.evaluate(() => document.getSelection().toString())).toBe(text);
  await row.evaluate((element) => element.focus());
  await openSelection(page);
  await expect(page.getByRole("menuitem")).toHaveText(["Copy selected text", "Open in Scratchpad"]);
  await page.getByRole("menuitem", { name: "Copy selected text", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe(text);
  await page.evaluate(() => document.getSelection().removeAllRanges());
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await underline.check();
  await page.locator("#context-menu-override").check();
  await page.locator("#context-menu-profile").selectOption("programmer");
  await expect.poll(() => underlinedText(row)).toBe("#123:look#456.name$object:inspect$object.name");
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-json").fill("{");
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toContainText("Previous valid");
  expect(await underlinedText(row)).toBe("#123:look#456.name$object:inspect$object.name");
  const config = referenceContextMenus();
  config.rules = [config.rules.find((rule) => rule.id === "object")];
  config.rules[0].pattern = "(?<object>#123)(?![0-9])";
  config.profiles[0] = { ...config.profiles[0], id: "programmer", label: "Programmer", rules: ["object"] };
  await page.locator("#context-menu-json").fill(JSON.stringify(config));
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toBeEmpty();
  await expect.poll(() => underlinedText(row)).toBe("#123");
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
  const connections = (await fixtureState(page)).connections;
  await page.reload();
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(connections);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await expect(underline).toBeChecked();
  await page.locator("#button-client-options-close").click();
  await socketFeed(page, "Persisted #123 #456\n");
  const restored = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Persisted #123 #456" }).last();
  await expect.poll(() => underlinedText(restored)).toBe("#123");
  await mkdir("tmp/context-menu-review", { recursive: true, mode: 0o700 });
  const screenshot = "tmp/context-menu-review/underlined-output-" + page.context().browser().browserType().name() + ".png";
  await page.screenshot({ path: screenshot });
  await chmod(screenshot, 0o600);
});

test("context menus: underlines work in both panes, pop-outs and redocked output", async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.outputTest.manager.updateSettings({ open: true, selected: ["team-chat"] }));
  await feed(page, "Main #123\n[-][Team-Chat] #456\n");
  const main = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Main #123" }).last();
  const secondary = page.locator("#secondaryBuffer [data-output-id]").last();
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await page.locator("#context-menu-underline").check();
  await page.locator("#button-client-options-close").click();
  await expect.poll(() => underlinedText(main)).toBe("#123");
  await expect.poll(() => underlinedText(secondary)).toBe("#456");
  const popupPromise = page.waitForEvent("popup");
  await page.locator("#button-output-popout").click();
  const popup = await popupPromise;
  const detached = popup.locator("#secondaryBuffer [data-output-id]").last();
  await expect.poll(() => underlinedText(detached)).toBe("#456");
  await expect.poll(() => underlinedText(main)).toBe("#123");
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await page.locator("#context-menu-underline").uncheck();
  await expect.poll(() => underlinedText(main)).toBe("");
  await expect.poll(() => underlinedText(detached)).toBe("");
  await page.locator("#context-menu-underline").check();
  await page.locator("#button-client-options-close").click();
  await expect.poll(() => underlinedText(detached)).toBe("#456");
  await popup.locator("#button-output-redock").click().catch((error) => {
    if (!popup.isClosed()) throw error;
  });
  await expect.poll(() => underlinedText(secondary)).toBe("#456");
  await expect.poll(() => underlinedText(main)).toBe("#123");
});

test("context menu JSON download exports the active rules and releases its Blob URL", async ({ page }) => {
  await start(page);
  await editConfig(page, (config) => {
    config.profiles.find(({ id }) => id === "player").label = "Export fixture Player";
  });
  const active = await page.evaluate(() => window.outputTest.client.contextMenus.config);
  const draft = page.locator("#context-menu-json");
  await draft.fill("{unfinished draft");
  await page.evaluate(() => {
    const create = window.URL.createObjectURL.bind(window.URL);
    const revoke = window.URL.revokeObjectURL.bind(window.URL);
    window.contextExportUrls = [];
    window.contextRevokedUrls = [];
    window.URL.createObjectURL = (blob) => {
      const url = create(blob);
      window.contextExportUrls.push({ type: blob.type, url });
      return url;
    };
    window.URL.revokeObjectURL = (url) => {
      window.contextRevokedUrls.push(url);
      revoke(url);
    };
  });

  const download = page.waitForEvent("download");
  await page.locator("#context-menu-export").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("context-menus.json");
  let body = "";
  for await (const chunk of await file.createReadStream()) body += chunk;
  const exported = JSON.parse(body);
  expect(exported).toEqual(active);
  expect(exported.profiles.find(({ id }) => id === "player").label).toBe("Export fixture Player");
  const urls = await page.evaluate(() => ({ created: window.contextExportUrls, revoked: window.contextRevokedUrls }));
  expect(urls.created).toHaveLength(1);
  expect(urls.created[0].type).toBe("application/json");
  expect(urls.revoked).toEqual([urls.created[0].url]);
  await expect(draft).toHaveValue("{unfinished draft");
});

test("overlong output keeps the native menu without blocking later reference matches", async ({ page }) => {
  await start(page);
  const output = page.locator("#lineBuffer [data-output-id]");
  const copy = page.getByRole("menuitem", { name: "Copy to Clipboard", exact: true });
  const copyReference = async (row, value) => {
    await expect(row).toBeVisible();
    await expect.poll(async () => {
      await row.focus();
      await page.keyboard.press("Shift+F10");
      return copy.count();
    }).toBe(1);
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe(value);
  };

  await feed(page, "#123 " + "x".repeat(32763) + "\n");
  await copyReference(output.filter({ hasText: /^#123 / }), "#123");

  await feed(page, "#456 " + "x".repeat(32764) + "\n");
  await expect(page.locator("#context-menu-error"))
    .toHaveText("Context line exceeds 32768 characters; native menus remain available.");
  const rejected = output.filter({ hasText: /^#456 / });
  await expect(rejected).toHaveCount(1);
  await rejected.focus();
  const native = await rejected.evaluate((element) => element.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true })
  ));
  expect(native).toBe(true);
  await expect(page.getByRole("menu")).toHaveCount(0);

  await feed(page, "Later #789\n");
  await copyReference(output.filter({ hasText: "Later #789" }), "#789");
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
});

test("context menus: configured rules target ANSI-split references and preserve native no-match menus", async ({ page }) => {
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
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
  await setContextSection(page, "basic");
  await page.locator("#context-menu-override").check();
  await setContextSection(page, "basic");
  await page.locator("#context-menu-profile").selectOption("local");
  await feed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: My tools (Override)");
  await setContextSection(page, "basic");
  await page.locator("#context-menu-override").uncheck();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (selected by server)");
  await page.evaluate(() => window.DomeBridge.onSessionChange("disconnected"));
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");
  await page.evaluate(() => window.DomeBridge.onSessionChange("connected"));
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-json").fill("{");
  await setContextSection(page, "advanced");
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

test("legacy output keyboard navigation clamps to its rows and opens each reference", async ({ page }) => {
  await start(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const emptyKeepsDefault = await page.evaluate(() => {
    const { client, manager } = window.outputTest;
    manager.destroy();
    delete client.outputWindows;
    client.buffer.replaceChildren();
    client.contextMenus.bindOutput(client.buffer, window);
    client.preferences.sdwcNowrapBlocks = true;
    const emptyKeepsDefault = client.buffer.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "ArrowDown", bubbles: true, cancelable: true
    }));
    client.parseSocketData("References #123 then #456 https://example.test/manual\n" +
      "#$# SDWC-START-NOWRAP\nGrid first #7\u001b[31m89\u001b[0m\nGrid second #987\n#$# SDWC-END-NOWRAP\nLast row #396\n");
    return emptyKeepsDefault;
  });
  expect(emptyKeepsDefault).toBe(true);
  const first = page.locator("#lineBuffer > div").filter({ hasText: "References #123 then #456" });
  const gridRows = page.locator("#lineBuffer > .sdwc-nowrap-block > div");
  await expect(gridRows).toHaveText(["Grid first #789", "Grid second #987"]);
  const last = page.locator("#lineBuffer > div").filter({ hasText: "Last row #396" });
  await expect(first).toHaveAttribute("tabindex", "-1");
  await first.focus();
  await page.keyboard.press("ArrowUp");
  await expect(first).toBeFocused();
  for (const row of [gridRows.nth(0), gridRows.nth(1), last, last]) {
    await page.keyboard.press("ArrowDown");
    await expect(row).toBeFocused();
  }
  const handledPrintableKey = await last.evaluate((element) => !element.dispatchEvent(new window.KeyboardEvent("keydown", {
    key: "x", bubbles: true, cancelable: true
  })));
  expect(handledPrintableKey).toBe(false);
  await expect(last).toBeFocused();
  const boundaryKeepsDefault = await last.evaluate((element) => element.dispatchEvent(new window.KeyboardEvent("keydown", {
    key: "ArrowDown", bubbles: true, cancelable: true
  })));
  expect(boundaryKeepsDefault).toBe(false);
  await expect(last).toBeFocused();
  for (const row of [gridRows.nth(1), gridRows.nth(0)]) {
    await page.keyboard.press("ArrowUp");
    await expect(row).toBeFocused();
  }
  await expect.poll(async () => {
    if (!await page.getByRole("menuitem").count()) await page.keyboard.press("Shift+F10");
    return page.getByRole("menuitem").allTextContents();
  }).toEqual(["Copy to Clipboard"]);
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#789");
  await expect(gridRows.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(first).toBeFocused();

  const link = first.getByRole("link");
  await link.focus();
  await page.keyboard.press("ArrowDown");
  await expect(link).toBeFocused();
  await first.focus();
  const keepsDefault = await first.evaluate((element) => element.dispatchEvent(new window.KeyboardEvent("keydown", {
    key: "ArrowDown", shiftKey: true, bubbles: true, cancelable: true
  })));
  expect(keepsDefault).toBe(true);
  await expect(first).toBeFocused();

  await expect.poll(async () => {
    if (!await page.getByRole("menuitem").count()) await page.keyboard.press("ContextMenu");
    return page.getByRole("menuitem").allTextContents();
  }).toEqual(["#123", "#456"]);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Copy to Clipboard", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#456");
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
  expect(errors).toEqual([]);
});

test("reference menus close after output pruning, Tab, or a click elsewhere", async ({ page }) => {
  await start(page);
  await feed(page, "old reference #123\nold plain text\n");
  const output = page.locator("#lineBuffer");
  const old = output.getByText("old reference #123", { exact: true });
  const fresh = output.getByText("fresh reference #456", { exact: true });
  const menu = page.getByRole("menu", { name: "Reference actions" });
  const openReference = async (row) => {
    await row.focus();
    await expect.poll(async () => {
      await page.keyboard.press("Shift+F10");
      return menu.count();
    }).toBe(1);
    await expect(menu.getByRole("menuitem", { name: "Copy to Clipboard" })).toBeFocused();
  };
  await openReference(old);
  await feed(page, "additional output while menu is open\n");
  await expect(old).toBeVisible();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Copy to Clipboard" })).toBeFocused();
  await page.evaluate(() => { window.outputTest.client.preferences.performanceBuffer = 2; });
  await feed(page, "fresh plain text\nfresh reference #456\n");
  await expect(old).toHaveCount(0);
  await expect(menu).toHaveCount(0);

  await openReference(fresh);
  await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
  await expect(fresh).toBeFocused();

  await openReference(fresh);
  await page.keyboard.press("Shift");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(fresh).toBeFocused();

  await openReference(fresh);
  await page.locator("#inputBuffer").click();
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => window.contextCopied)).toBeUndefined();

  await openReference(fresh);
  await menu.getByRole("menuitem", { name: "Copy to Clipboard" }).click();
  await expect(menu).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#456");
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
});

test("context menus: keyboard actions work in secondary and detached output", async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.outputTest.manager.updateSettings({ open: true, selected: ["team-chat"] }));
  await feed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
  await feed(page, "[-][Team-Chat] #12\u001b[31m3.name\u001b[0m\n");
  const row = page.locator("#secondaryBuffer [data-output-id]").last();
  await expect(row).toBeVisible();
  await expect.poll(async () => {
    await row.focus();
    await page.keyboard.press("Shift+F10");
    return page.getByRole("menuitem").allTextContents();
  }).toEqual(["[-][Team-Chat]", "#123.name"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Property #123.name", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#123.name");
  const popupPromise = page.waitForEvent("popup");
  await page.locator("#button-output-popout").click();
  const popup = await popupPromise;
  const detached = popup.locator("#secondaryBuffer [data-output-id]").last();
  await expect(detached).toBeVisible();
  await expect.poll(async () => {
    await detached.focus();
    await popup.keyboard.press("Shift+F10");
    return popup.getByRole("menuitem").allTextContents();
  }).toEqual(["[-][Team-Chat]", "#123.name"]);
  await popup.keyboard.press("Enter");
  await expect(popup.getByRole("menuitem")).toHaveText(["@rewind"]);
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
  await popup.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.contextSent)).toEqual([["input", "@rewind Team-Chat"]]);
  await detached.focus();
  await popup.keyboard.press("Shift+F10");
  await popup.getByRole("menuitem", { name: "#123.name", exact: true }).click();
  await expect(popup.getByRole("group", { name: "Property #123.name", exact: true })).toBeVisible();
  await popup.keyboard.press("Enter");
  await expect.poll(() => popup.evaluate(() => window.contextCopied)).toBe("#123.name");
  await detached.focus();
  await popup.keyboard.press("Shift+F10");
  await popup.getByRole("menuitem", { name: "#123.name", exact: true }).click();
  const ownerCopy = popup.getByRole("group", { name: "Object #123", exact: true }).getByRole("menuitem", { name: "Copy to Clipboard", exact: true });
  await expect(ownerCopy).toBeVisible();
  await mkdir("tmp/context-menu-review", { recursive: true, mode: 0o700 });
  const screenshot = "tmp/context-menu-review/grouped-context-menu-" + page.context().browser().browserType().name() + ".png";
  await popup.screenshot({ path: screenshot });
  await chmod(screenshot, 0o600);
  await ownerCopy.click();
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
  expect(await page.evaluate(() => window.contextSent)).toEqual([["input", "@rewind Team-Chat"]]);
});

test("right-click copies a reverse selection and leaves unrelated plain text native", async ({ page }) => {
  await start(page);
  await feed(page, "picked #123 then #456\n");
  const row = page.locator("#lineBuffer [data-output-id]").last();
  await expect(row).toHaveText("picked #123 then #456");
  await page.evaluate(() => {
    window.selectionContextEvents = [];
    document.addEventListener("contextmenu", (event) => {
      window.setTimeout(() => window.selectionContextEvents.push(event.defaultPrevented), 0);
    }, { capture: true });
  });

  const select = () => row.evaluate(async (element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    let last = first;
    let end = "picked #123".length;
    while (end > last.length) {
      end -= last.length;
      last = walker.nextNode();
    }
    document.getSelection().setBaseAndExtent(last, end, first, 0);
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  });
  await select();
  await rightText(page, row, 13);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.selectionContextEvents)).toEqual([false]);
  await page.keyboard.press("Escape");

  await select();
  await rightText(page, row, 8);
  const menu = page.getByRole("menu", { name: "Selected output actions" });
  await expect(menu).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.selectionContextEvents)).toEqual([false, true]);
  await menu.getByRole("menuitem", { name: "Copy selected text" }).click();
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("picked #123");
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
});

test("dismissing selected-output actions restores the original ANSI-split range", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await start(page);
  await feed(page, "before #12\u001b[31m3:name\u001b[0m after\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "before #123:name after" });
  await row.evaluate((element) => {
    // Model the live selection changing as focus shifts to the menu.
    document.addEventListener("focusin", (event) => {
      if (event.target.closest("[role=menu]")?.getAttribute("aria-label") !== "Selected output actions") return;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      document.getSelection().setBaseAndExtent(first, 0, first, 6);
    });
  });
  const buffer = page.locator("#lineBuffer");
  const menu = page.getByRole("menu", { name: "Selected output actions" });
  const selectedText = () => page.evaluate(() => document.getSelection().toString());

  for (const key of ["Escape", "Tab"]) {
    await row.evaluate((element) => {
      element.focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const locate = (offset) => {
        walker.currentNode = element;
        let node = walker.nextNode();
        while (offset > node.length) { offset -= node.length; node = walker.nextNode(); }
        return [node, offset];
      };
      document.getSelection().setBaseAndExtent(...locate(16), ...locate(7));
    });
    await expect.poll(selectedText).toBe("#123:name");
    await openSelection(page);
    await expect(menu.getByRole("menuitem", { name: "Copy selected text" })).toBeFocused();
    await expect.poll(selectedText).toBe("#123:name");
    // Exercise both a dropped and a replaced live range while focus is in the menu.
    await row.evaluate((element, replace) => {
      const selection = document.getSelection();
      selection.removeAllRanges();
      if (!replace) return;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      selection.setBaseAndExtent(first, 0, first, 6);
    }, key === "Tab");
    await expect.poll(selectedText).toBe(key === "Tab" ? "before" : "");
    await page.keyboard.press(key);
    await expect(menu).toHaveCount(0);
    await expect(buffer).toBeFocused();
    await expect.poll(selectedText).toBe("#123:name");
  }

  await page.evaluate(() => document.getSelection().removeAllRanges());
  await row.focus();
  const referenceMenu = page.getByRole("menu", { name: "Reference actions" });
  await expect.poll(async () => {
    if (!await referenceMenu.count()) await page.keyboard.press("Shift+F10");
    return referenceMenu.count();
  }).toBe(1);
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.contextCopied)).toBeUndefined();
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
});

for (const [reason, clipboardUnavailable] of [
  ["the active profile has no Copy action", false],
  ["the Clipboard API is unavailable", true]
]) {
  test("right-click leaves selected output native when " + reason, async ({ page }) => {
    if (clipboardUnavailable) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      });
    }
    await start(page, { clipboardStub: !clipboardUnavailable });
    if (!clipboardUnavailable) {
      await editConfig(page, (config) => {
        const player = config.profiles.find((profile) => profile.id === "player");
        player.selectionActions = [{
          id: "scratch-only",
          label: "Open in Scratchpad",
          type: "client-action",
          action: "ide.open-scratch",
          input: "selection"
        }];
      });
      await page.locator("#button-client-options-close").click();
    }
    await feed(page, "selected plain output\n");
    const row = page.locator("#lineBuffer [data-output-id]").last();
    await expect(row).toHaveText("selected plain output");
    await row.evaluate(async (element) => {
      window.selectionContextEvents = [];
      document.addEventListener("contextmenu", (event) => {
        window.setTimeout(() => window.selectionContextEvents.push(event.defaultPrevented), 0);
      }, { capture: true });
      element.focus();
      document.getSelection().selectAllChildren(element);
      document.dispatchEvent(new Event("selectionchange"));
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    });
    await rightText(page, row, 4);
    await expect.poll(() => page.evaluate(() => window.selectionContextEvents)).toEqual([false]);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.getSelection().toString())).toBe("selected plain output");
    expect(await page.evaluate(() => window.contextSent)).toEqual([]);
  });
}

test("a rejected context-menu Copy reports the error without sending input and remains retryable", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.contextCopyAttempts = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText(text) {
        const attempt = window.contextCopyAttempts.push(text);
        if (attempt === 1) return Promise.reject(new Error("Fixture denied clipboard access"));
        if (attempt === 2) throw new Error("Fixture clipboard unavailable");
        return Promise.resolve();
      } }
    });
  });
  await start(page, { clipboardStub: false });
  await feed(page, "selected output copy fixture\n");
  const row = page.locator("#lineBuffer [data-output-id]").last();
  await row.evaluate((element) => {
    element.focus();
    document.getSelection().selectAllChildren(element);
    document.dispatchEvent(new Event("selectionchange"));
  });

  const copy = page.getByRole("menuitem", { name: "Copy selected text" });
  for (const error of ["Fixture denied clipboard access", "Fixture clipboard unavailable", null]) {
    await openSelection(page);
    await copy.click();
    await expect(copy).toHaveCount(0);
    await expect(page.locator("#lineBuffer")).toBeFocused();
    if (error) await expect(page.locator("#context-menu-error")).toHaveText(error);
  }
  expect(await page.evaluate(() => window.contextCopyAttempts)).toEqual(Array(3).fill("selected output copy fixture"));
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
  expect(pageErrors).toEqual([]);
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
  await expect(ide.getByRole("tab")).toContainText("Temporary Scratch Pad");
  await expect(ide.locator("body")).toHaveCSS("background-color", "rgb(15, 23, 42)");
  const editorShell = ide.locator("#root > div > div > div");
  await expect(editorShell).toHaveCSS("background-color", "rgb(17, 24, 39)");
  await expect(editorShell).toHaveCSS("border-top-color", "rgb(51, 65, 85)");
  await ide.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(ide.locator("body")).toHaveCSS("background-color", "rgb(248, 250, 252)");
  await expect(editorShell).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(editorShell).toHaveCSS("border-top-color", "rgb(226, 232, 240)");
  await expect(ide.getByText("Unsaved", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
  const close = ide.getByRole("button", { name: "Close", exact: true });
  const closeWithConfirmation = (response) => Promise.all([
    ide.waitForEvent("dialog", { timeout: 5000 }).then(async (dialog) => {
      const message = dialog.message();
      await dialog[response]();
      expect(message).toContain("unsaved");
    }),
    close.click()
  ]);
  await closeWithConfirmation("dismiss");
  await expect(ide.getByRole("tab")).toHaveCount(1);
  // A second selection creates a separate editor document, not a new MOO record.
  await page.bringToFront();
  await page.evaluate(() => document.getSelection().removeAllRanges());
  await feed(page, "second selection\n");
  await page.locator("#lineBuffer [data-output-id]").last().evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
  await expect.poll(async () => { await page.keyboard.press("Shift+F10"); return page.getByRole("menuitem", { name: "Open in Scratchpad" }).count(); }).toBe(1);
  await page.getByRole("menuitem", { name: "Open in Scratchpad" }).click();
  await expect(ide.getByRole("tab")).toHaveCount(2);
  const statusDot = ide.getByRole("tab", { selected: true }).locator("span[aria-hidden=true]");
  const transparent = "rgba(0, 0, 0, 0)";
  await expect(statusDot).not.toHaveCSS("background-color", transparent);
  const unsavedColor = await statusDot.evaluate((element) => window.getComputedStyle(element).backgroundColor);
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
  await ide.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.contextSent.length)).toBe(2);
  const saved = [["input", "@scratch Temporary Scratch Pad"], ["input", "second selection\n."]];
  expect(await page.evaluate(() => window.contextSent)).toEqual(saved);
  await expect(ide.getByText("Saved", { exact: true })).toBeVisible();
  await expect(statusDot).not.toHaveCSS("background-color", transparent);
  await expect(statusDot).not.toHaveCSS("background-color", unsavedColor);

  const unexpectedDialogs = [];
  const recordDialog = async (dialog) => {
    unexpectedDialogs.push(dialog.message());
    await dialog.dismiss();
  };
  ide.on("dialog", recordDialog);
  try {
    await close.click();
    await expect(ide.getByRole("tab")).toHaveCount(1);
    expect(unexpectedDialogs).toEqual([]);
  } finally {
    ide.off("dialog", recordDialog);
  }

  await Promise.all([ide.waitForEvent("close", { timeout: 5000 }), closeWithConfirmation("accept")]);
  expect(await page.evaluate(() => window.contextSent)).toEqual(saved);
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
  await setContextSection(page, "basic");
  await page.locator("#context-menu-override").check();
  await setContextSection(page, "basic");
  await page.locator("#context-menu-profile").selectOption("programmer");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (Override)");
  await page.locator("#button-client-options-close").click();
  const objects = ["Copy to Clipboard", "@show", "Name and Number", "@verbs", "@props", "@parents", "@kids", "@siblings", "@tree", "Look"];
  const verbs = ["Copy to Clipboard", "@edit", "@list", "@show", "@args", "help", ...objects];
  const properties = ["Copy to Clipboard", "@edit", "@show", ...objects];
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

test("context menus: switching to GM on existing output needs no refresh or second right-click", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await socketFeed(page, "Existing #123\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Existing #123" }).last();
  await expect(row).toBeVisible();
  const change = async (profile) => {
    await page.locator("#button-client-options").click();
    await page.locator("#client-options-tab-context").click();
    await setContextSection(page, "basic");
    await page.locator("#context-menu-override").check();
    await setContextSection(page, "basic");
    await page.locator("#context-menu-profile").selectOption(profile);
    await page.locator("#button-client-options-close").click();
  };
  for (const profile of ["programmer", "gm", "player", "gm"]) {
    await change(profile);
    await rightText(page, row, 11);
    const commands = profile === "gm" ? ["@parents", "@kids", "@notes", "Look"] : profile === "programmer" ? ["@show", "Name and Number", "@verbs", "@props", "@parents", "@kids", "@siblings", "@tree", "Look"] : [];
    await expect(page.getByRole("menuitem")).toHaveText(profile === "player" ? [] : ["Copy to Clipboard", ...commands]);
    await page.keyboard.press("Escape");
  }
  await row.evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
  await openSelection(page);
  await page.keyboard.press("Escape");
  for (const profile of ["programmer", "gm"]) {
    await change(profile);
    expect(await page.evaluate(() => document.getSelection().toString())).toBe("Existing #123");
    await rightText(page, row, 11);
    await expect(page.getByRole("menuitem")).toHaveText(["Copy selected text", "Open in Scratchpad"]);
    await page.keyboard.press("Escape");
  }
});

test("context menus: real player bundle imports JSON, preserves override through transport reconnect, and deduplicates notices", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await expect(page.locator("#context-menu-profile")).toBeDisabled();
  const config = referenceContextMenus();
  config.profiles.push({ ...config.profiles[0], id: "staff", label: "Programmer" });
  config.profiles.push({ ...config.profiles[0], id: "local", label: "My tools" });
  config.rules[0].actions.push({ id: "show", label: "Inspect verb", type: "game-command", template: "@show ${object}:${verb}" });
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-file").setInputFiles({ name: "local-context.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(config)) });
  await expect(page.locator("#context-menu-profile option")).toHaveCount(5);
  await page.locator("#context-menu-file").focus();
  await page.evaluate(() => {
    window.profileNotices = [];
    new window.MutationObserver(() => window.profileNotices.push(document.querySelector("#context-menu-notice").textContent))
      .observe(document.querySelector("#context-menu-notice"), { childList: true });
  });
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"staff\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
  await expect(page.locator("#context-menu-notice")).toHaveText("Switched to Programmer context menus.");
  await expect(page.locator("#context-menu-notice")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#context-menu-file")).toBeFocused();
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"staff\"\n");
  const reloaded = structuredClone(config);
  reloaded.profiles.push({ ...config.profiles[0], id: "reload-check", label: "Reload check" });
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-json").fill(JSON.stringify(reloaded));
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-profile option")).toHaveCount(6);
  await expect(page.locator("#context-menu-error")).toBeEmpty();
  expect(await page.evaluate(() => window.profileNotices)).toEqual(["Switched to Programmer context menus."]);
  await setContextSection(page, "basic");
  await page.locator("#context-menu-override").check();
  await setContextSection(page, "basic");
  await page.locator("#context-menu-profile").selectOption("local");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: My tools (Override)");
  const connected = (await fixtureState(page)).connections;
  await page.request.post("/fixture/reconnect");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(connected);
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: My tools (Override)");
  await setContextSection(page, "basic");
  await page.locator("#context-menu-override").uncheck();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"staff\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
  await setContextSection(page, "basic");
  await page.locator("#context-menu-override").check();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: My tools (Override)");
  await setContextSection(page, "basic");
  await page.locator("#context-menu-override").uncheck();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-json").fill(JSON.stringify({ ...config, version: 999 }));
  await setContextSection(page, "advanced");
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

test("context menus: the keyboard chooser keeps adjacent custom matches in reading order", async ({ page }) => {
  await start(page);
  await editConfig(page, (config) => {
    const actions = config.rules.find(({ id }) => id === "object").actions;
    config.rules = [
      { id: "left", pattern: "Alpha", priority: 100, captures: {}, actions },
      { id: "right", pattern: "Beta", priority: 300, captures: {}, actions },
      { id: "overlap", pattern: "haBe|taAl", priority: 50, captures: {}, actions },
      { id: "actionless", pattern: "Void(?:Alpha)?", priority: 200, captures: {}, actions: [] }
    ];
    config.profiles[0].rules = config.rules.map(({ id }) => id);
  });
  await page.locator("#button-client-options-close").click();
  await feed(page, "AlphaBeta Void\nBetaAlpha Void\n");
  const items = page.getByRole("menuitem");
  for (const [text, ordered] of [["AlphaBeta Void", ["Alpha", "Beta"]], ["BetaAlpha Void", ["Beta", "Alpha"]]]) {
    const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: text });
    await row.focus();
    await expect.poll(async () => {
      if (!await items.count()) await page.keyboard.press("Shift+F10");
      return items.allTextContents();
    }).toEqual(ordered);
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await expect(items).toHaveText(["Copy to Clipboard"]);
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe(ordered[0]);
  }
  await page.evaluate(() => { delete window.contextCopied; });
  await feed(page, "VoidAlpha Beta\n");
  const masked = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "VoidAlpha Beta" });
  await masked.focus();
  await expect.poll(async () => {
    if (!await items.count()) await page.keyboard.press("Shift+F10");
    return items.allTextContents();
  }).toEqual(["Copy to Clipboard"]);
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("Beta");
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
});

test("context menus: an overlong expanded heading reports once and leaves keyboard fallback", async ({ page }) => {
  await start(page);
  await editConfig(page, (config) => {
    const rule = config.rules.find(({ id }) => id === "object");
    rule.heading = "${object}".repeat(20);
    config.rules = [rule];
    config.profiles[0].rules = [rule.id];
  });
  await page.locator("#button-client-options-close").click();
  const error = page.locator("#context-menu-error");
  await error.evaluate((node) => {
    window.contextHeadingReports = 0;
    new window.MutationObserver(() => { window.contextHeadingReports++; }).observe(node, { childList: true });
  });
  const longRef = "#" + "1".repeat(119);
  await feed(page, longRef + "\n#12\n");
  const rows = page.locator("#lineBuffer [data-output-id]");
  const longRow = rows.filter({ hasText: longRef });
  await longRow.focus();
  await expect.poll(async () => {
    await page.keyboard.press("Shift+F10");
    return error.textContent();
  }).toBe("command: invalid single-line command");
  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(0);
  await expect(longRow).toBeFocused();
  const nativeDefault = await longRow.evaluate((row) =>
    row.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true })));
  expect(nativeDefault).toBe(true);
  expect(await page.evaluate(() => window.contextHeadingReports)).toBe(1);
  await rows.filter({ hasText: /^#12$/ }).focus();
  await expect.poll(async () => {
    if (!await items.count()) await page.keyboard.press("Shift+F10");
    return items.allTextContents();
  }).toEqual(["Copy to Clipboard"]);
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.contextCopied)).toBe("#12");
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
});

test("context menus: shipped role files expose exact actions and copy only matched reference text", async ({ page, browserName }) => {
  const initial = await fixtureState(page);
  if (browserName === "chromium") await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\nObject #123\nVerb #12\u001b[31m3:look\u001b[0m\nProperty #123.name\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
  const object = page.locator("#lineBuffer [data-output-id]").filter({ hasText: /^Object / }).last();
  const verb = page.locator("#lineBuffer [data-output-id]").filter({ hasText: /^Verb / }).last();
  const property = page.locator("#lineBuffer [data-output-id]").filter({ hasText: /^Property / }).last();
  const open = async (row, offset, labels) => {
    await expect.poll(async () => { await rightText(page, row, offset); return page.getByRole("menuitem").allTextContents(); }).toEqual(labels);
  };
  const programmerObjects = ["Copy to Clipboard", "@show", "Name and Number", "@verbs", "@props", "@parents", "@kids", "@siblings", "@tree", "Look"];
  await open(object, 8, programmerObjects);
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
  await page.getByRole("menuitem", { name: "Name and Number", exact: true }).click();
  await open(object, 8, programmerObjects);
  await page.getByRole("menuitem", { name: "@kids", exact: true }).click();
  await open(verb, 7, ["Copy to Clipboard", "@edit", "@list", "@show", "@args", "help", ...programmerObjects]);
  await page.getByRole("menuitem", { name: "@args", exact: true }).click();
  await open(property, 11, ["Copy to Clipboard", "@edit", "@show", ...programmerObjects]);
  await page.getByRole("group", { name: "Property #123.name", exact: true }).getByRole("menuitem", { name: "@show", exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([";$string_utils:nn(#123)", "@kids #123 -lcd", "@args #123:look", "@show #123.name"]);
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: GM (selected by server)");
  await open(object, 8, ["Copy to Clipboard", "@parents", "@kids", "@notes", "Look"]);
  await page.getByRole("menuitem", { name: "@kids", exact: true }).click();
  for (const [row, offset, expected] of [[verb, 7, "#123:look"], [property, 11, "#123.name"]]) {
    await open(row, offset, ["Copy to Clipboard", "Copy to Clipboard", "@parents", "@kids", "@notes", "Look"]);
    await page.getByRole("group", { name: (expected.includes(":") ? "Verb " : "Property ") + expected, exact: true }).getByRole("menuitem", { name: "Copy to Clipboard", exact: true }).click();
    await expectClipboard(page, expected);
  }
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (selected by server)");
  for (const [row, offset] of [[object, 8], [verb, 7], [property, 11]]) {
    await rightText(page, row, offset);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  await object.evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
  await openSelection(page);
  await expect(page.getByRole("menuitem")).toHaveText(["Copy selected text"]);
  await page.getByRole("menuitem", { name: "Copy selected text" }).click();
  await expectClipboard(page, "Object #123");
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([";$string_utils:nn(#123)", "@kids #123 -lcd", "@args #123:look", "@show #123.name", "@kids #123"]);
});

async function startShippedReferenceProfile(page, browserName, id, label) {
  const initial = await fixtureState(page);
  if (browserName === "chromium") await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%" + JSON.stringify(id) + "\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: " + label + " (selected by server)");
  return async () => (await fixtureState(page)).commands.slice(initial.commands.length);
}

async function openShippedReferenceMenu(page, row, offset, labels) {
  await expect(row).toBeVisible();
  const items = page.getByRole("menu", { name: "Reference actions" }).getByRole("menuitem");
  await expect.poll(async () => {
    const current = await items.allTextContents();
    if (current.length) return current;
    await rightText(page, row, offset);
    return items.allTextContents();
  }, { timeout: 10000 }).toEqual(labels);
}

for (const object of ["#123", "$object"]) {
  const objectLabels = ["@show", "Name and Number", "@verbs", "@props", "@parents", "@kids", "@siblings", "@tree", "Look"];
  const objectCommands = ["@show " + object, ";$string_utils:nn(" + object + ")", "@verbs " + object, "@props " + object, "@parents " + object, "@kids " + object + " -lcd", "@siblings " + object, "@tree " + object, "look " + object];
  for (const [suffix, labels, commands] of [
    ["", objectLabels, objectCommands],
    [":inspect", ["@edit", "@list", "@show", "@args", "help"], ["@edit " + object + ":inspect", "@list " + object + ":inspect", "@show " + object + ":inspect", "@args " + object + ":inspect", "help " + object + ":inspect"]],
    [".name", ["@edit", "@show"], ["@edit " + object + ".name", "@show " + object + ".name"]]
  ]) {
    const reference = object + suffix;
    test("context menus: real bundle sends explicit Programmer commands for " + reference, async ({ page, browserName }) => {
      const readSent = await startShippedReferenceProfile(page, browserName, "programmer", "Programmer");
      const sent = [];
      const expected = ["Copy to Clipboard", ...labels, ...(suffix ? ["Copy to Clipboard", ...objectLabels] : [])];
      const offset = suffix ? 10 + object.length + 1 : 11;
      const primary = suffix ? page.getByRole("group", { name: (suffix.startsWith(":") ? "Verb " : "Property ") + reference, exact: true }) : page;
      await socketFeed(page, "Reference " + object.slice(0, 2) + "\u001b[32m" + object.slice(2) + suffix + "\u001b[0m\n");
      const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Reference " + reference }).last();
      for (let index = 0; index < labels.length; index++) {
        await openShippedReferenceMenu(page, row, offset, expected);
        expect(await readSent()).toEqual(sent);
        await primary.getByRole("menuitem", { name: labels[index], exact: true }).click();
        sent.push(commands[index]);
        await expect.poll(readSent).toEqual(sent);
      }
      await openShippedReferenceMenu(page, row, offset, expected);
      await primary.getByRole("menuitem", { name: "Copy to Clipboard", exact: true }).click();
      await expectClipboard(page, reference);
      if (suffix) {
        const owner = page.getByRole("group", { name: "Object " + object, exact: true });
        for (let index = 0; index < objectLabels.length; index++) {
          await openShippedReferenceMenu(page, row, offset, expected);
          await expect(page.getByRole("group")).toHaveCount(2);
          await expect(owner.getByRole("menuitem")).toHaveText(["Copy to Clipboard", ...objectLabels]);
          expect(await readSent()).toEqual(sent);
          await owner.getByRole("menuitem", { name: objectLabels[index], exact: true }).click();
          sent.push(objectCommands[index]);
          await expect.poll(readSent).toEqual(sent);
        }
        await openShippedReferenceMenu(page, row, offset, expected);
        await owner.getByRole("menuitem", { name: "Copy to Clipboard", exact: true }).click();
        await expectClipboard(page, object);
      }
    });
  }
}

test("context menus: real bundle copies traceback frames without sending a command", async ({ page, browserName }) => {
  const readSent = await startShippedReferenceProfile(page, browserName, "programmer", "Programmer");
  const frameFixture = JSON.parse(await readFile(new URL("../test-support/fixtures/context-menu-frames.json", import.meta.url), "utf8"));
  for (const frame of frameFixture.frames) {
    await socketFeed(page, frame.replace(":", "\u001b[31m:\u001b[0m") + "\n");
    const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: frame }).last();
    await openShippedReferenceMenu(page, row, frame.indexOf(":") + 2, ["Copy Frame"]);
    await page.keyboard.press("Escape");
    await row.evaluate((element) => { document.getSelection().removeAllRanges(); element.focus(); });
    await expect.poll(async () => { await page.keyboard.press("Shift+F10"); return page.getByRole("menuitem").allTextContents(); }).toEqual(["Copy Frame"]);
    await page.keyboard.press("Enter");
    await expectClipboard(page, frame);
    expect(await readSent()).toEqual([]);
    await row.evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
    await openSelection(page);
    await expect(page.getByRole("menuitem")).toHaveText(["Copy selected text", "Open in Scratchpad"]);
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.getSelection().removeAllRanges());
  }
});

test("context menus: real bundle sends GM Look only on explicit activation", async ({ page, browserName }) => {
  const readSent = await startShippedReferenceProfile(page, browserName, "gm", "GM");
  await socketFeed(page, "GM #123\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "GM #123" }).last();
  await openShippedReferenceMenu(page, row, 5, ["Copy to Clipboard", "@parents", "@kids", "@notes", "Look"]);
  expect(await readSent()).toEqual([]);
  await page.getByRole("menuitem", { name: "Look", exact: true }).click();
  await expect.poll(readSent).toEqual(["look #123"]);
});

test("context menus: grouped targets support keyboard, bounded positioning, atomic reload and selection precedence", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 460 });
  await page.context().addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(text) { window.contextCopied = text; } } });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\nNeighbor #999 and #12\u001b[31m3:inspect\u001b[0m\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Neighbor #999 and #123:inspect" });
  await expect(row).toBeVisible();
  const open = async () => {
    await expect.poll(async () => { await rightText(page, row, 23); return page.getByRole("group").allTextContents(); }).toHaveLength(2);
    await expect(page.getByRole("group").nth(0)).toHaveAttribute("aria-label", "Verb #123:inspect");
    await expect(page.getByRole("group").nth(1)).toHaveAttribute("aria-label", "Object #123");
  };
  await open();
  const menu = page.getByRole("menu");
  const box = await menu.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(760);
  expect(box.y + box.height).toBeLessThanOrEqual(460);
  expect(await menu.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.keyboard.press("End");
  await expect(page.getByRole("group", { name: "Object #123", exact: true }).getByRole("menuitem", { name: "Look", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("group", { name: "Verb #123:inspect", exact: true }).getByRole("menuitem", { name: "Copy to Clipboard", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.contextCopied)).toBe("#123:inspect");
  const config = await (await page.request.get("/profiles/programmer.json")).json();
  config.rules[0].relatedContexts[0].captures.object = "missing";
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-json").fill(JSON.stringify(config));
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toContainText(
    "programmer-verb.relatedContexts[0].captures.object: expected a declared capture with a compatible type"
  );
  await page.locator("#button-client-options-close").click();
  await open();
  await page.keyboard.press("Escape");
  config.rules[0].relatedContexts[0].captures.object = "object";
  config.rules.find((rule) => rule.id === "programmer-object").actions.push({ id: "review", label: "Review object", type: "game-command", template: "@show ${object}" });
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-json").fill(JSON.stringify(config));
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toBeEmpty();
  await page.locator("#button-client-options-close").click();
  await open();
  expect((await fixtureState(page)).commands).toEqual(connected.commands);
  await page.getByRole("group", { name: "Object #123", exact: true }).getByRole("menuitem", { name: "Review object", exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).commands.slice(connected.commands.length)).toEqual(["@show #123"]);
  await row.evaluate((element) => { element.focus(); document.getSelection().selectAllChildren(element); document.dispatchEvent(new Event("selectionchange")); });
  await openSelection(page);
  await expect(page.getByRole("group")).toHaveCount(0);
  await expect(page.getByRole("menuitem")).toHaveText(["Copy selected text", "Open in Scratchpad"]);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.getSelection().removeAllRanges());
  await row.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem")).toHaveText(["#999", "#123:inspect"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group").nth(1)).toHaveAttribute("aria-label", "Object #123");
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
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\n");
  await expect(page.locator("#context-menu-error")).toContainText("programmer");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toContainText("Previous valid");
  missingGM = false;
  invalidProgrammer = false;
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-error")).toBeEmpty();
  await expect(page.locator("#context-menu-profile option")).toHaveCount(3);
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
  await setContextSection(page, "basic");
  await page.locator("#context-menu-override").check();
  await setContextSection(page, "basic");
  await page.locator("#context-menu-profile").selectOption("gm");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: GM (Override)");
  await setContextSection(page, "basic");
  await page.locator("#context-menu-override").uncheck();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (selected by server)");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: GM (selected by server)");
  missingGM = true;
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");
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
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (selected by server)");
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
});

test("context menus: real bundle repeats rows, switches compiled profiles, reloads rules and captures menu styling", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.setViewportSize({ width: 1000, height: 620 });
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  const config = referenceContextMenus();
  config.profiles.push({ id: "objects", label: "Objects only", rules: ["object"] });
  config.rules[0].actions.push({ id: "show", label: "Inspect verb", type: "game-command", template: "@show ${object}:${verb}" });
  config.rules[0].actions.push({ id: "verbs", label: "List object verbs", type: "game-command", template: "@verbs ${object}" });
  await setContextSection(page, "advanced");
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
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Objects only (selected by server)");
  const switched = page.locator("#lineBuffer [data-output-id]").last();
  await expect.poll(async () => { await rightText(page, switched, 2); return page.getByRole("menuitem", { name: "Copy to Clipboard", exact: true }).count(); }).toBe(1);
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"player\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (selected by server)");
  await expect.poll(async () => { await rightText(page, switched, 2); return page.getByRole("menuitem", { name: "Inspect verb" }).count(); }).toBe(1);
  await page.keyboard.press("Escape");
  config.rules[0].pattern = "(?<object>#[0-9]+):(?<verb>inspect)";
  config.profiles.push({ ...config.profiles[0], id: "reloaded", label: "Reload marker" });
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-json").fill(JSON.stringify(config));
  await setContextSection(page, "advanced");
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

test("context menus: real bundle staff selection opens the existing IDE without a write until explicit Save", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const selected = "#123:look\n@quit";
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
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

test("context menus: a background unsaved Scratchpad still warns on IDE close", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);

  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
  const popup = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: Clean verb upload: @program #12:preview\r\nreturn 1;\r\n.\r\n");
  const ide = await popup;
  const clean = ide.getByRole("tab", { name: /Clean verb/ });
  await expect(clean).toHaveAttribute("aria-selected", "true");

  await page.bringToFront();
  const text = "Scratchpad close fixture";
  await socketFeed(page, text + "\n");
  const output = page.locator("#lineBuffer [data-output-id]").getByText(text, { exact: true });
  const scratchAction = page.getByRole("menuitem", { name: "Open in Scratchpad" });
  await expect.poll(async () => {
    if (await scratchAction.count()) return 1;
    await output.evaluate((row) => document.getSelection().selectAllChildren(row));
    await rightText(page, output);
    return scratchAction.count();
  }).toBe(1);
  await scratchAction.click();
  const scratch = ide.getByRole("tab", { name: /Temporary Scratch Pad/ });
  await expect(scratch).toHaveAttribute("aria-selected", "true");
  await expect(ide.getByText("Unsaved", { exact: true })).toBeVisible();

  await clean.click();
  await expect(clean).toHaveAttribute("aria-selected", "true");
  await expect(ide.getByText("Saved", { exact: true })).toBeVisible();
  const warnsOnUnload = () => ide.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })));
  expect(await warnsOnUnload()).toBe(true);

  const closeScratch = scratch.getByRole("button", { name: "Close Temporary Scratch Pad" });
  let confirmation;
  ide.once("dialog", async (dialog) => {
    confirmation = dialog.message();
    await dialog.dismiss();
  });
  await closeScratch.click();
  expect(confirmation).toBe("Tab has unsaved changes. Close anyway?");
  await expect(scratch).toBeVisible();
  await expect(clean).toHaveAttribute("aria-selected", "true");
  expect(await warnsOnUnload()).toBe(true);

  ide.once("dialog", (dialog) => dialog.accept());
  await closeScratch.click();
  await expect(scratch).toHaveCount(0);
  await expect(clean).toHaveAttribute("aria-selected", "true");
  await expect.poll(warnsOnUnload).toBe(false);
  expect((await fixtureState(page)).commands).toEqual(connected.commands);
});

test("context menus: the real IDE reports when its scratchpad is disabled", async ({ page }) => {
  await page.context().route("**/editor/ide/", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("scratch", "off");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\n");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Programmer (selected by server)");
  await socketFeed(page, "Selected scratchpad fixture\n");
  const selected = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Selected scratchpad fixture" });
  await selected.evaluate((row) => {
    row.focus();
    document.getSelection().selectAllChildren(row);
  });
  await openSelection(page);
  const popup = page.waitForEvent("popup");
  await page.getByRole("menuitem", { name: "Open in Scratchpad" }).click();
  const ide = await popup;
  await expect(page.locator("#lineBuffer").getByText("Scratchpad is disabled by this client's existing IDE settings.", { exact: true })).toBeVisible();
  await expect(ide.locator(".ace_editor")).toHaveCount(0);

  await socketFeed(page, "#$# edit name: Ordinary verb upload: @program #12:preview\r\nreturn 1;\r\n.\r\n");
  await expect(ide.getByRole("tab", { name: /Ordinary verb/ })).toBeVisible();
  await expect.poll(() => ide.locator(".ace_editor").evaluate((element) => element.env.editor.getValue())).toBe("return 1;");
  expect((await fixtureState(page)).commands).toEqual(connected.commands);
});

test("context menus: reverse 2000-line virtual selection copies partial endpoints and opens the same unsaved scratchpad text", async ({ page, browserName }) => {
  await start(page, { clipboardStub: false });
  if (browserName === "chromium") await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
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
  await expectClipboard(page, expected);
  await openSelection(page);
  const popup = page.waitForEvent("popup");
  await page.getByRole("menuitem", { name: "Open in Scratchpad" }).click();
  const ide = await popup;
  await expect(ide.getByRole("tab")).toHaveCount(1);
  await expect(ide.getByText("Unsaved", { exact: true })).toBeVisible();
  await expect.poll(() => ide.evaluate(() => document.querySelector(".ace_editor")?.env.editor.getValue())).toBe(expected);
  expect(await page.evaluate(() => window.contextSent)).toEqual([]);
});


test("context menus: edited shipped Player JSON is used on startup and Options reload without local overrides", async ({ page }) => {
  const player = JSON.parse(await readFile(new URL("../data/profiles/player.json", import.meta.url), "utf8"));
  player.profiles[0].label = "Edited Player";
  player.rules[0].actions[0].label = "Edited rewind";
  await page.route("**/profiles/player.json", (route) => route.fulfill({ json: player }));
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Edited Player (Fallback)");
  await socketFeed(page, "[-][SIC-PM] Edited file test\r\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Edited file test" });
  await expect(row).toBeVisible();
  await expect.poll(async () => { await row.focus(); await page.keyboard.press("Shift+F10"); return page.getByRole("menuitem", { name: "Edited rewind", exact: true }).count(); }).toBe(1);
  await page.keyboard.press("Escape");
  player.profiles[0].label = "Reloaded Player";
  player.rules[0].actions[0].label = "Reloaded rewind";
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await setContextSection(page, "advanced");
  await expect(page.locator("#context-menu-json")).toHaveValue(JSON.stringify({ version: 1, rules: [], profiles: [] }, null, 2));
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Reloaded Player (Fallback)");
  await page.locator("#button-client-options-close").click();
  await expect.poll(async () => { await rightText(page, row, 5); return page.getByRole("menuitem", { name: "Reloaded rewind", exact: true }).count(); }).toBe(1);
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
});

test("context menus: a mounted burst beyond the worker queue cap retains first and last row menus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 3200 });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await expect(page.locator("#context-menu-profile option")).toHaveCount(3);
  await socketFeed(page, Array.from({ length: 2000 }, (_, index) => "[-][SIC-PM] Burst " + index).join("\r\n") + "\r\n");
  const last = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Burst 1999" });
  await expect(last).toBeVisible();
  await expect.poll(() => page.locator("#lineBuffer [data-output-id]").count()).toBeGreaterThan(257);
  const config = defaultContextMenus();
  config.profiles[0].label = "Burst Player";
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await setContextSection(page, "advanced");
  await page.locator("#context-menu-json").fill(JSON.stringify(config));
  await page.locator("#context-menu-reload").click();
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Burst Player (Fallback)");
  await page.locator("#button-client-options-close").click();
  await expect.poll(async () => { await last.focus(); await page.keyboard.press("Shift+F10"); return page.getByRole("menuitem", { name: "@rewind", exact: true }).count(); }).toBe(1);
  await page.keyboard.press("Escape");
  const firstPrevented = await page.locator("#lineBuffer [data-output-id]").first().evaluate((element) => {
    const event = new window.KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(firstPrevented).toBe(true);
  await expect(page.getByRole("menuitem", { name: "@rewind", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await rightText(page, last, 5);
  await expect(page.getByRole("menuitem", { name: "@rewind", exact: true })).toBeVisible();
  await expect(page.locator("#context-menu-error")).toBeEmpty();
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
  await page.getByRole("menuitem", { name: "@rewind", exact: true }).click();
  await expect.poll(async () => (await fixtureState(page)).commands.slice(initial.commands.length)).toEqual(["@rewind SIC-PM"]);
});

test("context menus: a slow JSON import cannot overwrite the latest Options rules", async ({ page }) => {
  await page.addInitScript(() => {
    const readText = window.File.prototype.text;
    window.File.prototype.text = async function () {
      const text = await readText.call(this);
      if (this.name === "older.json") {
        await new Promise((resolve) => { window.releaseContextFile = resolve; });
      }
      return text;
    };
  });
  await page.goto("/?entry=real");
  await expect(page.locator("#context-menu-profile option")).toHaveCount(3);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await setContextSection(page, "advanced");

  const config = referenceContextMenus();
  const file = page.locator("#context-menu-file");
  const editor = page.locator("#context-menu-json");
  const choose = (name) => file.setInputFiles({
    name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(config))
  });
  config.profiles[0].label = "Older import";
  await choose("older.json");
  await expect(file).toHaveValue("");
  await expect.poll(() => page.evaluate(() => typeof window.releaseContextFile)).toBe("function");
  config.profiles[0].label = "Latest rules";
  await choose("latest.json");
  await expect(page.locator("#context-menu-profile option[value=player]")).toHaveText("Latest rules");

  await page.evaluate(() => window.releaseContextFile());
  await expect(editor).toHaveValue(JSON.stringify(config));
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("dc-context-menus")).profiles[0].label)).toBe("Latest rules");
});

test("context menus: failed Options reload applies intervening OOB and cannot restore a reset session", async ({ page }) => {
  let paused = false;
  let release;
  await page.route("**/profiles/gm.json", async (route) => {
    if (!paused) { await route.continue(); return; }
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ status: 500, body: "Synthetic failed reload" });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await expect(page.locator("#context-menu-profile option")).toHaveCount(3);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await setContextSection(page, "advanced");
  paused = true;
  for (const reset of [false, true]) {
    release = null;
    await page.locator("#context-menu-reload").click();
    await expect.poll(() => typeof release).toBe("function");
    await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\r\n" + (reset ? "#$# SDWC%%CONTEXT-RESET\r\n" : "") + "Reload barrier " + reset + "\r\n");
    await expect(page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Reload barrier " + reset })).toHaveCount(1);
    release();
    await expect(page.locator("#context-menu-error")).toContainText("Previous valid");
    await expect(page.locator("#context-menu-active")).toHaveText(reset ? "Active Profile: Player (Fallback)" : "Active Profile: Programmer (selected by server)");
  }
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
});

test("context menus: worker-unusable fetched files disable rather than activating bundled Player rules", async ({ page }) => {
  await page.route("**/profiles/*.json", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop().replace(".json", "");
    const config = JSON.parse(await readFile(new URL("../data/profiles/" + id + ".json", import.meta.url), "utf8"));
    config.rules.push({ id: "empty", priority: 0, pattern: "^", captures: {}, actions: [] });
    await route.fulfill({ json: config });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await expect(page.locator("#context-menu-error")).toContainText("zero-length");
  await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Disabled (no profiles available)");
  await expect(page.locator("#context-menu-profile option")).toHaveCount(0);
  await socketFeed(page, "[-][SIC-PM] No usable rules\r\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "No usable rules" });
  await expect(row).toBeVisible();
  await row.focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await rightText(page, row, 5);
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
});

test("streamed editor protocol passes complete text to the editor in the real player bundle", async ({ page }) => {
  await page.context().addInitScript(() => {
    window.protocolEditors = [];
    window.open = () => {
      const editor = { focus() {}, close() {}, addEventListener() {}, closed: false };
      window.protocolEditors.push(editor);
      return editor;
    };
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=windows");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);

  await socketFeed(page, "#$# edit name: protocol fixture upload: fixture-command\r\nfirst\r\n");
  await socketFeed(page, "second\r\n.\r");
  await socketFeed(page, "\nOutput after the editor.\r\n");

  await expect.poll(() => page.evaluate(() => window.protocolEditors.map(editor => editor.editorData))).toEqual([
    { editorName: "protocol fixture", uploadCommand: "fixture-command", buffer: "first\nsecond" }
  ]);
  await expect(page.locator("#lineBuffer")).toContainText("Output after the editor.");
  expect((await fixtureState(page)).commands).toEqual(connected.commands);
});

for (const [mode, name, useBlankPopup] of [
  ["ide", "IDE", false], ["windows", "individual editor", false], ["ide", "IDE popup fallback", true]
]) {
  test(`the real ${name} loads the saved Ambience Ace theme`, async ({ page }) => {
    if (useBlankPopup) await page.addInitScript(() => {
      const open = window.open.bind(window);
      window.open = (url, ...args) => {
        if (String(url).startsWith("/editor/ide/")) {
          window.fixtureBlockedIdeNavigation = true;
          return null;
        }
        return open(url, ...args);
      };
    });
    const initial = await fixtureState(page);
    await page.goto(`/?entry=real&ed=${mode}&et=ambience`);
    await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
    const connected = await fixtureState(page);
    const popup = page.waitForEvent("popup", { timeout: 8000 });
    await socketFeed(page, "#$# edit name: Theme fixture upload: @program #12:preview\r\nreturn 12;\r\n.\r\n");
    const editor = await popup;
    await expect(editor.locator(".ace_editor")).toHaveClass(/\bace-ambiance\b/, { timeout: 4000 });
    if (useBlankPopup) expect(await page.evaluate(() => window.fixtureBlockedIdeNavigation)).toBe(true);
    expect((await fixtureState(page)).commands).toEqual(connected.commands);
  });
}

test("the real individual verb editor keeps canceled edits and saves only on explicit Ctrl+S", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=windows");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  const popup = page.waitForEvent("popup", { timeout: 8000 });
  await socketFeed(page, "#$# edit name: Classic fixture upload: @program #12:preview\r\nreturn 12;\r\n.\r\n");
  const editor = await popup;
  const holder = editor.locator("#verb-editor-holder");
  const text = () => holder.evaluate((element) => element.env?.editor.getValue());
  const status = editor.locator("#verb-status-holder");
  await expect.poll(text).toBe("return 12;");
  await editor.bringToFront();
  await holder.click();
  const editorInput = holder.locator(".ace_text-input");
  await expect(editorInput).toBeFocused();
  await editorInput.press("Control+1");
  await expect(status).toHaveText("VIM MODE");
  await editorInput.press("Control+0");
  await expect(status).toHaveText("REGULAR MODE");

  await editor.keyboard.press("Control+a");
  await editor.keyboard.insertText("return 13;");
  await expect.poll(text).toBe("return 13;");
  const wouldWarnOnUnload = () => editor.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })));
  expect(await wouldWarnOnUnload()).toBe(true);
  const close = editor.getByRole("button", { name: "CLOSE", exact: true });
  let warning;
  editor.once("dialog", async (dialog) => { warning = dialog.message(); await dialog.dismiss(); });
  await close.click();
  expect(warning).toBe("Abort editing and lose your changes?");
  await expect.poll(text).toBe("return 13;");
  expect((await fixtureState(page)).commands).toEqual(connected.commands);

  await holder.click();
  await editorInput.press("Control+s");
  const saved = () => fixtureState(page).then(({ commands }) => commands.slice(connected.commands.length));
  await expect.poll(saved).toEqual(["@program #12:preview", "return 13;\n."]);
  await expect(status).toHaveText(/^Last Save: \d{1,2}:\d{1,2}:\d{1,2}$/);
  expect(await wouldWarnOnUnload()).toBe(false);
  const closed = editor.waitForEvent("close", { timeout: 5000 });
  await close.click().catch((error) => {
    if (!editor.isClosed()) throw error; // Firefox can close before acknowledging the click.
  });
  await closed;
  expect(await saved()).toEqual(["@program #12:preview", "return 13;\n."]);
});

test("the real individual verb editor applies MOO mode and clears corrected diagnostics", async ({ page }) => {
  await page.context().route("**/editor/verb/**", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("parser", "moo");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=windows");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  const popup = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: Classic diagnostics upload: @program #12:preview\r\nreturn 3 4;\r\n.\r\n");
  const editor = await popup;
  const holder = editor.locator("#verb-editor-holder");
  await expect.poll(() => holder.evaluate((element) => {
    const aceEditor = element.env?.editor;
    if (!aceEditor) return null;
    return [aceEditor.session.getMode().$id, aceEditor.getOption("tabSize"), aceEditor.getOption("useSoftTabs")];
  })).toEqual(["ace/mode/moo", 2, true]);
  const annotations = () => holder.evaluate((element) => element.env.editor.session.getAnnotations());
  await expect.poll(annotations).toContainEqual({ row: 0, column: 9, text: "MOO syntax error", type: "error" });
  await holder.evaluate((element) => element.env.editor.setValue("return 3;", -1));
  await expect.poll(annotations).toEqual([]);
  expect((await fixtureState(page)).commands).toEqual(connected.commands);
});

test("the real basic editor keeps local edits when replacement is canceled and uploads only on Save", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=windows");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  const sendEditor = (text) => socketFeed(page, `#$# edit name: Plain fixture upload: @scratch Plain fixture\r\n${text}\r\n.\r\n`);
  const popup = page.waitForEvent("popup", { timeout: 8000 });
  await sendEditor("Original line\r\nSecond line");
  const editor = await popup;
  await expect(editor).toHaveURL(/\/editor\/basic\//);
  await expect(editor).toHaveTitle("Editing Plain fixture");
  const input = editor.getByRole("textbox");
  await expect(input).toHaveValue("Original line\nSecond line");
  await input.fill("Local first line\nLocal second line");
  const warnsOnUnload = () => editor.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })));

  // The server can reopen the same named editor while it has unsaved text.
  await editor.evaluate(() => {
    window.confirm = (message) => { window.fixtureReplacementPrompt = message; return false; };
  });
  await sendEditor("Replacement line");
  await expect.poll(() => editor.evaluate(() => window.fixtureReplacementPrompt)).toContain("Replace existing editor of the same name?");
  await expect(input).toHaveValue("Local first line\nLocal second line");
  expect(await warnsOnUnload()).toBe(true);
  expect((await fixtureState(page)).commands).toEqual(connected.commands);

  await editor.getByRole("button", { name: "@scratch Plain fixture", exact: true }).click();
  const sent = () => fixtureState(page).then(({ commands }) => commands.slice(connected.commands.length));
  const expected = ["@scratch Plain fixture", "Local first line\nLocal second line\n."];
  await expect.poll(sent).toEqual(expected);
  expect(await warnsOnUnload()).toBe(false);
  const closed = editor.waitForEvent("close", { timeout: 5000 });
  await editor.getByRole("button", { name: "CLOSE", exact: true }).click();
  await closed;
  expect(await sent()).toEqual(expected);
});

test("the real view-only basic editor displays text without an upload control", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=windows");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  const popup = page.waitForEvent("popup", { timeout: 8000 });
  await socketFeed(page, "#$# edit name: Viewed fixture upload: \r\nView this fixture\r\n.\r\n");
  const editor = await popup;
  await expect(editor).toHaveURL(/\/editor\/basic-readonly\//);
  await expect(editor).toHaveTitle("Viewing Viewed fixture");
  await expect(editor.getByRole("textbox")).toHaveValue("View this fixture");
  await expect(editor.getByRole("button", { name: "READ-ONLY", exact: true })).toBeVisible();
  await expect(editor.locator(".upload")).toHaveCount(0);
  const closed = editor.waitForEvent("close", { timeout: 5000 });
  await editor.getByRole("button", { name: "CLOSE", exact: true }).click();
  await closed;
  expect((await fixtureState(page)).commands).toEqual(connected.commands);
});

test("the real classic verb editor updates its font from the parent Options", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=windows");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  const popup = page.waitForEvent("popup", { timeout: 8000 });
  await socketFeed(page, "#$# edit name: Font fixture upload: @program #12:inspect\r\nreturn 12;\r\n.\r\n");
  const editor = await popup;
  const holder = editor.locator("#verb-editor-holder");
  const font = () => holder.evaluate((element) => element.env?.editor.getOption("fontFamily").replaceAll("'", ""));
  await expect.poll(font).toBe("Source Code Pro");
  await page.locator("#button-client-options").click();
  await page.getByRole("tab", { name: "Presentation", exact: true }).click();
  await page.locator("#editorfont-option select").selectOption("monaco");
  await page.locator("#button-client-options-close").click();
  await expect.poll(font).toBe("Monaco");
  const messageErrors = await editor.evaluate(() => {
    const errors = [];
    const captureError = (event) => errors.push(event.message);
    window.addEventListener("error", captureError);
    for (const data of [null, { type: "fixture-other-message", font: "standard" }]) {
      window.dispatchEvent(new window.MessageEvent("message", { data }));
    }
    window.removeEventListener("error", captureError);
    return errors;
  });
  expect(messageErrors).toEqual([]);
  expect(await font()).toBe("Monaco");
  expect((await fixtureState(page)).commands).toEqual(connected.commands);
});

test("real player drops pre-ready output and profile markers during a transport reconnect", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await socketFeed(page, "Retained before reconnect\r\n");
  const output = page.locator("#lineBuffer");
  await expect(output).toContainText("Retained before reconnect");

  try {
    const opening = page.waitForEvent("websocket", { timeout: 8000 });
    await page.request.post("/fixture/reconnect", { data: { holdGameReady: true } });
    const transport = await opening;
    await expect.poll(async () => (await fixtureState(page)).waitingForGame).toEqual(["websocket"]);
    const received = transport.waitForEvent("framereceived", {
      predicate: frame => String(frame.payload).includes("Stale output during reconnect"),
      timeout: 5000
    });
    await socketFeed(page, "Stale output during reconnect\r\n#$# SDWC%%CONTEXT-PROFILE%%\"programmer\"\r\n");
    await received;
    await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
    await expect(output).not.toContainText("Stale output during reconnect");
    await expect(page.locator("#context-menu-active")).toHaveText("Active Profile: Player (Fallback)");

    await page.request.post("/fixture/game-ready");
    await socketFeed(page, "Fresh after reconnect\r\n");
    await expect(output).toContainText("Fresh after reconnect");
    await expect(output).toContainText("Retained before reconnect");
  } finally {
    await page.request.post("/fixture/game-ready");
  }
});

test("the real IDE toolbar switches tab orientation and hides disabled Scratch controls", async ({ page }) => {
  await page.goto("/editor/ide/?scratch=off");
  const horizontal = page.getByRole("button", { name: "Horizontal tabs (top)" });
  const vertical = page.getByRole("button", { name: "Vertical tabs (left)" });
  await vertical.click();
  await expect(vertical).toHaveAttribute("aria-pressed", "true");
  await expect(horizontal).toHaveAttribute("aria-pressed", "false");
  await horizontal.click();
  await expect(horizontal).toHaveAttribute("aria-pressed", "true");
  await expect(vertical).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Add Scratch", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View Scratch", exact: true })).toHaveCount(0);

  await page.goto("/editor/ide/");
  await expect(page.getByRole("button", { name: "Add Scratch", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "View Scratch", exact: true })).toBeVisible();
});

test("the real IDE adds a blank Scratch tab and explicitly requests the saved Scratchpad", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const before = (await fixtureState(page)).commands.length;
  const commands = () => fixtureState(page).then((state) => state.commands.slice(before));

  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: scratch toolbar fixture upload: @program #12:preview\r\nreturn 1;\r\n.\r\n");
  const ide = await opened;
  const original = ide.getByRole("tab", { name: /scratch toolbar fixture/i });
  await expect(original).toHaveAttribute("aria-selected", "true");

  await ide.getByRole("button", { name: "Add Scratch", exact: true }).click();
  const scratch = ide.getByRole("tab", { name: /Temporary Scratch Pad/ });
  await expect(scratch).toHaveAttribute("aria-selected", "true");
  const scratchEditor = ide.locator(".ace_editor:visible");
  await expect.poll(() => scratchEditor.evaluate((element) => element.env.editor.getValue())).toBe("");
  expect(await commands()).toEqual([]);

  await scratchEditor.evaluate((element) => element.env.editor.focus());
  await ide.keyboard.insertText("toolbar scratch fixture");
  await expect.poll(() => scratchEditor.evaluate((element) => element.env.editor.getValue())).toBe("toolbar scratch fixture");
  expect(await commands()).toEqual([]);
  await ide.getByRole("button", { name: "Save", exact: true }).click();
  const saved = ["@scratch Temporary Scratch Pad", "toolbar scratch fixture\n."];
  await expect.poll(commands).toEqual(saved);

  await ide.getByRole("button", { name: "Add Scratch", exact: true }).click();
  await expect(scratch).toHaveCount(2);
  await expect(scratch.last()).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => scratchEditor.evaluate((element) => element.env.editor.getValue())).toBe("");
  await scratch.first().click();
  await expect.poll(() => scratchEditor.evaluate((element) => element.env.editor.getValue())).toBe("toolbar scratch fixture");
  expect(await commands()).toEqual(saved);

  await original.click();
  await expect(original).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => scratchEditor.evaluate((element) => element.env.editor.getValue())).toBe("return 1;");
  await ide.getByRole("button", { name: "View Scratch", exact: true }).click();
  await expect.poll(commands).toEqual([...saved, "@edit me.scratch"]);
});

test("the real IDE applies wrap, Vim and Options font changes to both mounted tabs", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  const popup = page.waitForEvent("popup", { timeout: 8000 });
  await socketFeed(page, "#$# edit name: First settings tab upload: @program #12:first\r\nreturn 12;\r\n.\r\n");
  const ide = await popup;
  const editors = ide.locator(".ace_editor");
  await expect(editors).toHaveCount(1);
  await socketFeed(page, "#$# edit name: Second settings tab upload: @program #13:second\r\nreturn 13;\r\n.\r\n");
  await expect(editors).toHaveCount(2);
  const values = () => editors.evaluateAll((elements) => elements.map(({ env: { editor } }) => ({
    wrap: editor.getSession().getUseWrapMode(),
    vim: editor.getKeyboardHandler()?.$id === "ace/keyboard/vim",
    font: editor.getOption("fontFamily").replaceAll("'", ""),
    text: editor.getValue()
  })));
  const expectSettings = (wrap, vim, font) => expect.poll(values).toEqual([
    { wrap, vim, font, text: "return 12;" }, { wrap, vim, font, text: "return 13;" }
  ]);
  await expectSettings(false, false, "Source Code Pro");
  await ide.getByRole("button", { name: "Enable word wrap" }).click();
  await ide.keyboard.press("Control+1");
  await expectSettings(true, true, "Source Code Pro");

  await page.locator("#button-client-options").click();
  await page.getByRole("tab", { name: "Presentation", exact: true }).click();
  await page.locator("#editorfont-option select").selectOption("monaco");
  await page.locator("#button-client-options-close").click();
  await expectSettings(true, true, "Monaco");

  await ide.getByRole("button", { name: "Disable word wrap" }).click();
  await ide.keyboard.press("Control+0");
  await expectSettings(false, false, "Monaco");
  await editors.evaluateAll((elements) => {
    window.resizedIdeTabs = [];
    for (const { env: { editor } } of elements) {
      const resize = editor.resize.bind(editor);
      editor.resize = (...args) => {
        window.resizedIdeTabs.push(editor.getValue());
        resize(...args);
      };
    }
  });
  const expectResized = async (width, height, text) => {
    await ide.evaluate(async () => {
      // Flush any resize scheduled by selecting the tab before resizing the window.
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      window.resizedIdeTabs = [];
    });
    await ide.setViewportSize({ width, height });
    await expect.poll(() => ide.evaluate(() => [...new Set(window.resizedIdeTabs)])).toEqual([text]);
  };
  await expect(ide.getByRole("tab", { name: /Second settings tab/ })).toHaveAttribute("aria-selected", "true");
  await expectResized(1100, 650, "return 13;");
  await ide.getByRole("tab", { name: /First settings tab/ }).click();
  await expectResized(760, 740, "return 12;");
  await expectSettings(false, false, "Monaco");

  await ide.bringToFront();
  await ide.keyboard.press("Control+Shift+L");
  await expectSettings(true, false, "Monaco");
  await ide.keyboard.press("Control+Shift+L");
  await expectSettings(false, false, "Monaco");

  await socketFeed(page, "#$# edit name: Third settings tab upload: @program #14:third\r\nreturn 14;\r\n.\r\n");
  const firstTab = ide.getByRole("tab", { name: /First settings tab/ });
  const secondTab = ide.getByRole("tab", { name: /Second settings tab/ });
  const thirdTab = ide.getByRole("tab", { name: /Third settings tab/ });
  await expect(thirdTab).toHaveAttribute("aria-selected", "true");
  await ide.bringToFront();
  await ide.keyboard.press("Control+BracketLeft");
  await expect(secondTab).toHaveAttribute("aria-selected", "true");
  await ide.keyboard.press("Control+BracketLeft");
  await expect(firstTab).toHaveAttribute("aria-selected", "true");
  await ide.keyboard.press("Control+BracketLeft");
  await expect(thirdTab).toHaveAttribute("aria-selected", "true");
  await ide.keyboard.press("Control+BracketRight");
  await expect(firstTab).toHaveAttribute("aria-selected", "true");
  await ide.keyboard.press("Control+BracketRight");
  await expect(secondTab).toHaveAttribute("aria-selected", "true");

  await ide.keyboard.press("Control+Shift+X");
  await expect(ide.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");
  await ide.keyboard.press("Control+Shift+X");
  await expect(ide.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
  await expect(ide.getByRole("button", { name: "Horizontal tabs (top)" })).toHaveAttribute("aria-pressed", "true");
  await expect(secondTab).toHaveAttribute("aria-selected", "true");

  const wouldUseBrowserDefault = (key, shiftKey = false) => ide.evaluate(({ key, shiftKey }) => {
    return document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", {
      key, shiftKey, ctrlKey: true, bubbles: true, cancelable: true
    }));
  }, { key, shiftKey });
  for (const [key, shiftKey] of [["0", false], ["[", false], ["]", false], ["l", true], ["x", true]]) {
    expect(await wouldUseBrowserDefault(key, shiftKey)).toBe(false);
  }
  await expect(secondTab).toHaveAttribute("aria-selected", "true");
  expect((await fixtureState(page)).commands).toEqual(connected.commands);
});

test("the real IDE can resize an empty window before it has an active editor", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/editor/ide/");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await page.evaluate(() => {
    window.emptyIdeResized = false;
    window.addEventListener("resize", () => { window.emptyIdeResized = true; }, { once: true });
  });
  await page.setViewportSize({ width: 1100, height: 650 });
  await page.waitForFunction(() => window.emptyIdeResized);
  await page.evaluate(() => new Promise((resolve) =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
  expect(errors).toEqual([]);
});

test("the real IDE keeps display preferences usable when storage rejects writes and reads", async ({ page }) => {
  await page.addInitScript(() => {
    const keys = new Set(["ide-dark", "ide-orientation"]);
    for (const operation of ["getItem", "setItem"]) {
      const original = window.Storage.prototype[operation];
      window.Storage.prototype[operation] = function (key, ...args) {
        if (keys.has(key)) throw new DOMException("Fixture storage blocked", "SecurityError");
        return original.call(this, key, ...args);
      };
    }
  });
  await page.goto("/editor/ide/");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
});

test("the real IDE blocks invalid MOO source and saves corrected source after worker diagnostics clear", async ({ page }) => {
  await page.context().route("**/editor/ide/", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("parser", "moo");
    const response = await route.fetch({ url: url.href });
    await route.fulfill({ response });
  });

  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const before = (await fixtureState(page)).commands;
  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: syntax fixture upload: @program #12:preview\r\nreturn 1;\r\n.\r\n");
  const ide = await opened;
  const editor = ide.locator(".ace_editor");
  const getAnnotations = () => editor.evaluate((element) => element.env.editor.getSession().getAnnotations());

  await expect(editor).toBeVisible();
  const save = ide.getByRole("button", { name: "Save", exact: true });
  for (const [source, text] of [
    ["if (1)\n  return 1;", "Missing endif"],
    ["return (1 + );", "Missing identifier"],
    ["return 3 4;", "MOO syntax error"]
  ]) {
    await editor.evaluate((element, source) => element.env.editor.setValue(source, -1), source);
    await expect.poll(getAnnotations).toContainEqual(expect.objectContaining({ type: "error", text }));
    await save.click();
    await expect(ide.getByText("Unsaved", { exact: true })).toBeVisible();
    expect((await fixtureState(page)).commands).toEqual(before);
  }

  const corrected = "constructor = 2;\nreturn constructor;";
  await editor.evaluate((element, text) => element.env.editor.setValue(text, -1), corrected);
  await expect.poll(getAnnotations).toEqual([]);
  await save.click();
  await expect.poll(async () => (await fixtureState(page)).commands.slice(before.length))
    .toEqual(["@program #12:preview", corrected + "\n."]);
});

test("the real IDE browses and edits object verbs and properties through the fixture transport", async ({ page }) => {
  await page.context().route("**/editor/ide/", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("browsers", "on");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });

  const { connections } = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(connections);
  const before = (await fixtureState(page)).commands.length;
  const commands = () => fixtureState(page).then(({ commands }) => commands.slice(before));

  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: verb fixture upload: @program #12:preview\r\nreturn 1;\r\n.\r\n");
  const ide = await opened;
  const save = ide.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeVisible();
  await ide.getByRole("tab", { name: "Object Browser" }).click();
  await expect(ide.getByRole("heading", { name: "Object Browser" })).toBeVisible();
  await expect(save).toHaveCount(0);
  await ide.keyboard.press("Control+s");
  const preview = ide.getByRole("button", { name: "preview", exact: true });
  await expect(preview).toHaveCount(0);
  await ide.getByRole("button", { name: "Load Verbs" }).click();
  await expect(preview).toBeVisible();
  await expect.poll(commands).toEqual(["#$# SDWC%%VERBS%%#12"]);

  await socketFeed(page, "#$# SDWC%%VERBS%%" + JSON.stringify({
    id: "#12",
    verbs: {
      first: { name: "look* examine", args: ["this", "none", "none"], owner: "#42", permissions: "rx", lastUpdated: "fixture date" },
      second: { name: "wait" }
    }
  }) + "\r\n");
  const look = ide.getByRole("button", { name: "look*", exact: true });
  await expect(look).toBeVisible();
  await expect(preview).toHaveCount(0);
  await expect(ide.getByText("^ examine", { exact: true })).toBeVisible();
  await expect(ide.getByText("this none none", { exact: true })).toBeVisible();
  await expect(ide.getByText("#42", { exact: true })).toBeVisible();
  await expect(ide.getByText("rx", { exact: true })).toBeVisible();
  await expect(ide.getByText("fixture date", { exact: true })).toBeVisible();
  await ide.getByRole("button", { name: "Collapse #12" }).click();
  await expect(look).toHaveCount(0);
  await ide.getByRole("button", { name: "Expand #12" }).click();
  await look.click();
  await expect.poll(commands).toEqual(["#$# SDWC%%VERBS%%#12", "@edit #12:look"]);

  await socketFeed(page, "#$# edit name: property fixture upload: @set-note-text #12.preview\r\noriginal\r\n.\r\n");
  await ide.getByRole("tab", { name: "Property Browser" }).click();
  await expect(ide.getByRole("heading", { name: "Property Browser" })).toBeVisible();
  await expect(save).toHaveCount(0);
  await ide.keyboard.press("Control+s");
  await expect(preview).toHaveCount(0);
  await ide.getByRole("button", { name: "load props" }).click();
  await expect(preview).toBeVisible();
  await expect.poll(commands).toEqual(["#$# SDWC%%VERBS%%#12", "@edit #12:look", "#$# SDWC%%PROPS%%#12"]);

  await socketFeed(page, "#$# SDWC%%PROPS%%" + JSON.stringify({
    id: "#12",
    name: "Fixture object",
    owner: "#42",
    parent: "#7",
    flags: { r: 1, w: true },
    props: { label: { clear: 1, owner: "#8", permissions: "rw" }, title: { clear: 0 } }
  }) + "\r\n");
  const summary = ide.getByRole("button", { name: "Collapse #12" });
  await expect(summary).toContainText("Fixture object (#12) | Owner: #42 | Parent: #7 | Permissions: +rw");
  await expect(preview).toHaveCount(0);
  const label = ide.getByRole("button", { name: "label", exact: true });
  await expect(label).toBeVisible();
  await expect(ide.getByText("clear", { exact: true })).toHaveCount(1);
  await expect(ide.getByText("#8", { exact: true })).toBeVisible();
  await expect(ide.getByText("rw", { exact: true })).toBeVisible();
  await summary.click();
  await expect(label).toHaveCount(0);
  await ide.getByRole("button", { name: "Expand #12" }).click();
  await label.click();
  await expect.poll(commands).toEqual([
    "#$# SDWC%%VERBS%%#12",
    "@edit #12:look",
    "#$# SDWC%%PROPS%%#12",
    "@edit #12.label"
  ]);

  const ideErrors = [];
  ide.on("pageerror", (error) => ideErrors.push(error.message));
  await ide.evaluate(() => {
    window.malformedObjectReplies = [];
    window.addEventListener("message", ({ data }) => {
      if (data?.payload?.fixtureMissingObject) window.malformedObjectReplies.push(data.type);
    });
  });
  const malformed = JSON.stringify({ fixtureMissingObject: true });
  await socketFeed(page, "#$# SDWC%%VERBS%%" + malformed + "\r\n"
    + "#$# SDWC%%PROPS%%" + malformed + "\r\n");
  await expect.poll(() => ide.evaluate(() => window.malformedObjectReplies))
    .toEqual(["ide-object-verbs", "ide-object-props"]);
  await expect(label).toBeVisible();
  await ide.getByRole("tab", { name: "Object Browser" }).click();
  await expect(look).toBeVisible();
  expect(ideErrors).toEqual([]);
});

test("the real MOO editor indents block code and leaves comment text aligned", async ({ page }) => {
  await page.context().route("**/editor/ide/", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("parser", "moo");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);

  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: indentation fixture upload: @program #12:preview\r\nreturn 1;\r\n.\r\n");
  const ide = await opened;
  const editor = ide.locator(".ace_editor");
  await expect(editor).toBeVisible();
  await expect.poll(() => editor.evaluate((element) => element.env.editor.session.getMode().$id)).toBe("ace/mode/moo");
  const replace = (text) => editor.evaluate((element, value) => {
    element.env.editor.setValue(value, 1);
    element.env.editor.focus();
  }, text);
  const contents = () => editor.evaluate((element) => element.env.editor.getValue());

  const opener = "  if (x) // guard";
  await replace(opener);
  await ide.keyboard.press("Enter");
  await expect.poll(contents).toBe(opener + "\n    ");

  const comment = "  if (x)\n    /* literal text\n      endi";
  await replace(comment);
  await expect.poll(() => editor.evaluate((element) => element.env.editor.session.getState(2))).toBe("comment");
  await ide.keyboard.type("f");
  await expect.poll(contents).toBe(comment + "f");

  const block = "  if (x)\n    /* literal text\n      endif\n    */\n";
  await replace(block + "        els");
  await ide.keyboard.type("e");
  await expect.poll(contents).toBe(block + "  else");
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
});

test("context menus hit-test fresh text nodes before an output repaint is observed", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("dc-context-menus-preferences", JSON.stringify({ override: true, profile: "programmer", underline: true }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(text) { window.contextCopied = text; } } });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await socketFeed(page, "Rendered #123:look\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Rendered #123:look" }).last();
  await expect.poll(() => underlinedText(row)).toBe("#123:look");

  // Like Find, this wraps text in a mark without changing the row's text.
  // Replace the hit-test node while the real right-click is traveling to the row,
  // before a MutationObserver can refresh the match cache.
  await row.evaluate((element) => {
    document.addEventListener("contextmenu", (event) => {
      const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
      const node = caret?.offsetNode || document.caretRangeFromPoint?.(event.clientX, event.clientY)?.startContainer;
      if (!node || !element.contains(node) || node.nodeType !== 3) return;
      const mark = document.createElement("mark");
      mark.append(node.cloneNode());
      node.replaceWith(mark);
      window.replacedOutputText = true;
    }, { capture: true, once: true });
  });
  await rightText(page, row, 15);
  expect(await page.evaluate(() => window.replacedOutputText)).toBe(true);
  const verb = page.getByRole("group", { name: "Verb #123:look" });
  await expect(verb).toBeVisible();
  await verb.getByRole("menuitem", { name: "Copy to Clipboard" }).click();
  expect(await page.evaluate(() => window.contextCopied)).toBe("#123:look");
});

for (const [command, limit] of [["@local-save-note", 2], ["@local-save-node", 3], ["@local-save-node-admin", 4]]) {
  test("the real IDE keeps accepted edits when " + command + " reaches its line limit", async ({ page }) => {
    await page.context().route("**/editor/ide/", async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set("lineLimits", "short");
      await route.fulfill({ response: await route.fetch({ url: url.href }) });
    });
    const initial = await fixtureState(page);
    await page.goto("/?entry=real&ed=ide");
    await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
    const before = (await fixtureState(page)).commands;
    const opened = page.waitForEvent("popup");
    await socketFeed(page, "#$# edit name: line limit fixture upload: " + command + " fixture\r\ninitial\r\n.\r\n");
    const ide = await opened;
    const editor = ide.locator(".ace_editor");
    await expect(editor).toBeVisible();
    const contents = () => editor.evaluate((element) => element.env.editor.getValue());
    const paste = (text) => editor.evaluate((element, value) => {
      const aceEditor = element.env.editor;
      aceEditor.navigateFileEnd();
      aceEditor.focus();
      aceEditor.onPaste(value);
    }, text);
    const extra = Array.from({ length: limit - 1 }, (_, index) => "\nLine " + (index + 2)).join("");
    await paste(extra);
    const accepted = "initial" + extra;
    await expect.poll(contents).toBe(accepted);
    await ide.keyboard.press("Enter");
    await expect.poll(contents).toBe(accepted);
    await paste("\nRejected\nAlso rejected");
    await expect.poll(contents).toBe(accepted);

    // Redo is an ordinary editor command. A rejected paste must not be
    // replayable or consume an earlier accepted edit from the undo history.
    await editor.evaluate((element) => element.env.editor.execCommand("redo"));
    await expect.poll(contents).toBe(accepted);
    await editor.evaluate((element) => element.env.editor.execCommand("undo"));
    await expect.poll(contents).toBe("initial");
    await editor.evaluate((element) => element.env.editor.execCommand("redo"));
    await expect.poll(contents).toBe(accepted);

    await editor.evaluate((element) => {
      const aceEditor = element.env.editor;
      const last = aceEditor.session.getLength() - 1;
      aceEditor.selection.setSelectionAnchor(last - 1, aceEditor.session.getLine(last - 1).length);
      aceEditor.selection.selectTo(last, aceEditor.session.getLine(last).length);
      aceEditor.onPaste("\r\nReplacement");
    });
    const replaced = accepted.replace(/[^\n]+$/, "Replacement");
    await expect.poll(async () => (await contents()).replace(/\r\n/g, "\n")).toBe(replaced);
    await paste(" inline text");
    const withInlineEdit = replaced + " inline text";
    await expect.poll(async () => (await contents()).replace(/\r\n/g, "\n")).toBe(withInlineEdit);
    await editor.evaluate((element) => {
      const aceEditor = element.env.editor;
      window.copiedLineCommands = 0;
      aceEditor.commands.on("exec", (event) => {
        if (event.command.name === "copylinesdown") window.copiedLineCommands++;
      });
      aceEditor.navigateFileEnd();
      aceEditor.focus();
    });
    await ide.keyboard.press("Alt+Shift+ArrowDown");
    expect(await ide.evaluate(() => window.copiedLineCommands)).toBe(1);
    await expect.poll(async () => (await contents()).replace(/\r\n/g, "\n")).toBe(withInlineEdit);
    const saved = await contents();

    expect((await fixtureState(page)).commands).toEqual(before);
    await ide.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await fixtureState(page)).commands.slice(before.length))
      .toEqual([command + " fixture", saved + "\n."]);
  });
}

test("the real VMS save dialog keeps keyboard focus and uploads only on submit", async ({ page }) => {
  await page.context().route("**/editor/ide/", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("vms", "on");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const before = (await fixtureState(page)).commands;
  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: VMS fixture upload: @program #12:preview\r\nreturn 1;\r\n.\r\n");
  const ide = await opened;
  const save = ide.getByRole("button", { name: "Save", exact: true });
  const dialog = ide.getByRole("dialog", { name: "VMS save note prompt" });
  const input = dialog.getByRole("textbox", { name: "VMS note prompt input" });
  await save.click();
  await expect(input).toBeFocused();
  await ide.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Submit" })).toBeFocused();
  await ide.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await input.click();
  await input.fill("discarded note");
  await ide.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeFocused();
  expect((await fixtureState(page)).commands).toEqual(before);

  await save.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await ide.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await ide.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeFocused();
  expect((await fixtureState(page)).commands).toEqual(before);

  await save.click();
  await expect(input).toBeFocused();
  await ide.mouse.click(4, 4);
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeFocused();
  expect((await fixtureState(page)).commands).toEqual(before);

  await save.click();
  await input.fill("Fixture VMS note");
  await ide.evaluate(() => {
    window.fixtureVmsUploadSocket = window.uploadSocket;
    window.uploadSocket = null;
  });
  await ide.keyboard.press("Enter");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Fixture VMS note");
  expect((await fixtureState(page)).commands).toEqual(before);
  await ide.evaluate(() => { window.uploadSocket = window.fixtureVmsUploadSocket; });
  await ide.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeFocused();
  const programSave = ["@program #12:preview", "return 1;\n.", "Fixture VMS note"];
  const saves = () => fixtureState(page).then(({ commands }) => commands.slice(before.length));
  await expect.poll(saves).toEqual(programSave);

  await save.click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(saves).toEqual([...programSave, ...programSave]);

  const inlineNote = ide.getByRole("textbox", { name: "VMS note", exact: true });
  await expect(inlineNote).toHaveValue("Fixture VMS note");
  await inlineNote.fill("");
  await expect(inlineNote).toBeFocused();
  await expect(inlineNote).toBeVisible();
  await ide.locator(".ace_editor").click();
  await expect(inlineNote).toHaveCount(0);
  expect(await saves()).toEqual([...programSave, ...programSave]);

  await save.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const savesThroughBlankNote = [...programSave, ...programSave, ...programSave.slice(0, 2)];
  await expect.poll(saves).toEqual(savesThroughBlankNote);

  await ide.getByRole("button", { name: "Add Scratch", exact: true }).click();
  await expect(ide.getByRole("tab", { name: /Temporary Scratch Pad/ })).toHaveAttribute("aria-selected", "true");
  await ide.locator(".ace_editor:visible").click();
  await ide.keyboard.insertText("fixture scratch");
  await save.click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(saves).toEqual([...savesThroughBlankNote, "@scratch Temporary Scratch Pad", "fixture scratch\n."]);
});

test("the VMS prompt saves its original verb after another editor tab arrives", async ({ page }) => {
  await page.context().route("**/editor/ide/", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("vms", "on");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const before = (await fixtureState(page)).commands.length;
  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: Existing verb upload: @program #19:existing\r\nreturn 19;\r\n.\r\n");
  const ide = await opened;
  const editorTab = (name) => ide.locator("[role=tab]").filter({ hasText: name });
  await expect(editorTab("Existing verb")).toHaveAttribute("aria-selected", "true");

  await socketFeed(page, "#$# edit name: Save target upload: @program #12:preview\r\nreturn 12;\r\n.\r\n");
  const target = editorTab("Save target");
  await expect(target).toHaveAttribute("aria-selected", "true");
  await ide.getByRole("button", { name: "Save", exact: true }).click();
  const dialog = ide.getByRole("dialog", { name: "VMS save note prompt" });
  const note = dialog.getByRole("textbox", { name: "VMS note prompt input" });
  await note.fill("Target tab note");

  await socketFeed(page, "#$# edit name: Incoming verb upload: @program #23:incoming\r\nreturn 23;\r\n.\r\n");
  await expect(editorTab("Incoming verb")).toHaveAttribute("aria-selected", "true");
  await expect(note).toHaveValue("Target tab note");
  expect((await fixtureState(page)).commands.slice(before)).toEqual([]);
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await fixtureState(page)).commands.slice(before))
    .toEqual(["@program #12:preview", "return 12;\n.", "Target tab note"]);
  await target.click();
  await expect(ide.getByRole("textbox", { name: "VMS note", exact: true })).toHaveValue("Target tab note");
});

test("the real IDE modifier click resolves this without opening lookalike variables", async ({ page }) => {
  await page.context().route("**/editor/ide/", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("navigation", "on");
    url.searchParams.set("hover", "off");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const before = (await fixtureState(page)).commands.length;
  const opened = page.waitForEvent("popup");
  const source = ["this:preview();", "unrelatedthis:other();", "$tools.label;", "return 1;"].join("\r\n");
  await socketFeed(page, "#$# edit name: navigation fixture upload: @program #12:look\r\n" + source + "\r\n.\r\n");
  const ide = await opened;
  const editor = ide.locator(".ace_editor");
  await expect(editor).toBeVisible();
  const clickCode = async (row, column, modified = false) => {
    const point = await editor.evaluate((element, position) => {
      const renderer = element.env.editor.renderer;
      const { pageX, pageY } = renderer.textToScreenCoordinates(position.row, position.column);
      return { x: pageX + 2, y: pageY + renderer.lineHeight / 2 };
    }, { row, column });
    if (modified) await ide.keyboard.down("Control");
    try {
      await ide.mouse.click(point.x, point.y);
    } finally {
      if (modified) await ide.keyboard.up("Control");
    }
  };
  const commands = async () => (await fixtureState(page)).commands.slice(before);
  await clickCode(0, 7);
  expect(await commands()).toEqual([]);
  await clickCode(0, 7, true);
  await expect.poll(commands).toEqual(["@edit #12:preview"]);
  await clickCode(1, 16, true);
  await clickCode(2, 9, true);
  await expect.poll(commands).toEqual(["@edit #12:preview", "@edit $tools.label"]);
});

test("the real IDE requests and caches verb and property hover previews", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const before = (await fixtureState(page)).commands.length;
  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: hover fixture upload: @program #12:look\r\nthis:preview();\r\n$tools.label;\r\nreturn 1;\r\n.\r\n");
  const ide = await opened;
  const editor = ide.locator(".ace_editor:visible");
  await expect(editor).toBeVisible();
  const hoverCode = async (row, column) => {
    const point = await editor.evaluate((element, position) => {
      const renderer = element.env.editor.renderer;
      const { pageX, pageY } = renderer.textToScreenCoordinates(position.row, position.column);
      return { x: pageX - window.scrollX + 2, y: pageY - window.scrollY + renderer.lineHeight / 2 };
    }, { row, column });
    await ide.mouse.move(point.x, point.y);
    return point;
  };
  await ide.mouse.move(4, 4);
  const commands = async () => (await fixtureState(page)).commands.slice(before);
  const overlay = ide.locator(".sdwc-hover-overlay");
  const pointer = await hoverCode(0, 7);
  const verbRequest = "#$# SDWC%%VERB-OVERLAY%%#12%%preview";
  await expect.poll(commands).toEqual([verbRequest]);
  await expect(overlay).toContainText("#12:preview");
  await expect(overlay).toContainText("Loading...");
  // The preview should open near the target while leaving the target itself reachable.
  const bounds = await overlay.boundingBox();
  expect(bounds.x - pointer.x).toBeGreaterThan(0);
  expect(bounds.y - pointer.y).toBeGreaterThan(0);
  expect(bounds.x - pointer.x).toBeLessThan(32);
  expect(bounds.y - pointer.y).toBeLessThan(32);
  await hoverCode(0, 8);
  await socketFeed(page, "#$# SDWC%%VERB-OVERLAY%%" + JSON.stringify({
    object: "#12", verb: "preview", value: ["First fixture line", "Second fixture line"]
  }) + "\n");
  await expect(overlay.locator("pre")).toHaveText("First fixture line\nSecond fixture line");
  await ide.mouse.move(4, 4);
  await expect(overlay).toHaveCount(0);
  await hoverCode(0, 7);
  await expect(overlay.locator("pre")).toHaveText("First fixture line\nSecond fixture line");

  await hoverCode(1, 9);
  const propertyRequest = "#$# SDWC%%PROP-OVERLAY%%$tools%%label";
  await expect.poll(commands).toEqual([verbRequest, propertyRequest]);
  await socketFeed(page, "#$# SDWC%%PROP-OVERLAY%%" + JSON.stringify({
    object: "$tools", property: "label", value: "Fixture property"
  }) + "\n");
  await expect(overlay).toContainText("$tools.label");
  await expect(overlay.locator("pre")).toHaveText("Fixture property");
  await hoverCode(2, 3);
  await expect(overlay).toHaveCount(0);
  await hoverCode(1, 9);
  await expect(overlay.locator("pre")).toHaveText("Fixture property");
  const editorText = () => editor.evaluate((element) => element.env.editor.getValue());
  await socketFeed(page, "#$# edit name: second hover fixture upload: @program #13:another\r\nreturn 2;\r\n.\r\n");
  await expect.poll(editorText).toBe("return 2;");
  await expect(overlay).toHaveCount(0);

  await ide.keyboard.press("Control+BracketLeft");
  await expect.poll(editorText).toContain("this:preview();");
  await ide.mouse.move(4, 4);
  await hoverCode(0, 7);
  await expect(overlay.locator("pre")).toHaveText("First fixture line\nSecond fixture line");
  await ide.keyboard.press("Control+BracketRight");
  await expect.poll(editorText).toBe("return 2;");
  await expect(overlay).toHaveCount(0);
  await ide.keyboard.press("Control+BracketLeft");
  await expect.poll(editorText).toContain("this:preview();");
  await expect(overlay).toHaveCount(0);
  expect(await commands()).toEqual([verbRequest, propertyRequest]);
});

test("the real IDE shortcut guide keeps editing shortcuts from reaching the document", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const before = (await fixtureState(page)).commands.length;
  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: shortcuts fixture upload: @program #12:preview\r\nreturn 1;\r\n.\r\n");
  const ide = await opened;
  const editor = ide.locator(".ace_editor");
  await expect(editor).toBeVisible();
  await editor.evaluate((element) => element.env.editor.setValue("return 2;", -1));
  const unsaved = ide.getByText("Unsaved", { exact: true });
  await expect(unsaved).toBeVisible();
  const opener = ide.getByRole("button", { name: "Show editor shortcuts" });
  await opener.click();
  const dialog = ide.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await ide.keyboard.press("Control+s");
  await ide.keyboard.press("Control+e");
  await expect(dialog).toBeVisible();
  await expect(unsaved).toBeVisible();
  expect((await fixtureState(page)).commands.slice(before)).toEqual([]);
  await expect(dialog).toHaveAccessibleName("Editor Shortcuts");
  const close = dialog.getByRole("button", { name: "Close shortcuts" });
  await expect(close).toBeFocused();
  await ide.keyboard.press("Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("heading", { name: "Editor Shortcuts" }).click();
  await expect(dialog).toBeVisible();
  await ide.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await ide.keyboard.press("Control+Slash");
  await expect(close).toBeFocused();
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(dialog).toBeVisible();
  await ide.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await ide.keyboard.press("Control+s");
  await expect.poll(async () => (await fixtureState(page)).commands.slice(before))
    .toEqual(["@program #12:preview", "return 2;\n."]);
});

test("the real IDE ignores an older Wasm result as soon as the editor changes", async ({ page }) => {
  await page.context().route("**/editor/ide/", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("parser", "moo");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  await page.context().addInitScript(() => {
    const BrowserWorker = window.Worker;
    window.Worker = class extends BrowserWorker {
      addEventListener(type, listener, options) {
        if (type !== "message" || !this.isMooParser) return super.addEventListener(type, listener, options);
        return super.addEventListener(type, (event) => {
          window.fixtureParserReply = () => {
            listener(event);
            return event.data.annotations;
          };
        }, options);
      }

      constructor(...args) {
        super(...args);
        this.isMooParser = String(args[0]).endsWith("/moo-parser-worker.js");
      }
    };
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: delayed parser fixture upload: @program #12:preview\r\nif (1)\r\n  return 1;\r\n.\r\n");
  const ide = await opened;
  const editor = ide.locator(".ace_editor");
  await expect(editor).toBeVisible();
  await ide.waitForFunction(() => Boolean(window.fixtureParserReply));

  const annotations = await editor.evaluate((element) => {
    const editor = element.env.editor;
    editor.setValue("return 2;", -1);
    const previousReply = window.fixtureParserReply();
    delete window.fixtureParserReply;
    return { previousReply, displayed: editor.getSession().getAnnotations() };
  });
  expect(annotations.previousReply).toContainEqual(expect.objectContaining({ type: "error", text: "Missing endif" }));
  expect(annotations.displayed).toEqual([]);
  await ide.waitForFunction(() => Boolean(window.fixtureParserReply));
  expect(await ide.evaluate(() => window.fixtureParserReply())).toEqual([]);
  await expect.poll(() => editor.evaluate((element) => element.env.editor.getSession().getAnnotations())).toEqual([]);
});

test("the real IDE recovers after a temporary parser grammar load failure", async ({ page }) => {
  await page.context().route("**/editor/ide/", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("parser", "moo");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  let grammarRequests = 0;
  await page.context().route("**/tree-sitter-moo.wasm", async (route) => {
    if (++grammarRequests === 1) {
      await route.fulfill({ status: 503, body: "Fixture parser temporarily unavailable" });
    } else {
      await route.continue();
    }
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const before = (await fixtureState(page)).commands;
  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: grammar fixture upload: @program #12:preview\r\nreturn 1;\r\n.\r\n");
  const ide = await opened;
  const editor = ide.locator(".ace_editor");
  await expect(editor).toBeVisible();
  const annotations = () => editor.evaluate((element) => element.env.editor.getSession().getAnnotations());
  await expect.poll(annotations).toEqual([{
    row: 0, column: 0, type: "warning", text: expect.stringContaining("Fixture parser temporarily unavailable")
  }]);
  expect(grammarRequests).toBe(1);
  await editor.evaluate((element) => element.env.editor.setValue("if (1)\n  return 1;", -1));
  await expect.poll(annotations).toContainEqual(expect.objectContaining({ type: "error", text: "Missing endif" }));
  expect(grammarRequests).toBe(2);
  await editor.evaluate((element) => element.env.editor.setValue("", -1));
  await expect.poll(annotations).toEqual([]);
  expect(grammarRequests).toBe(2);
  expect((await fixtureState(page)).commands).toEqual(before);
});

test("real split output uses updated filters after an obsolete routing worker fails", async ({ page }) => {
  await page.context().addInitScript(() => {
    const send = window.Worker.prototype.postMessage;
    window.Worker.prototype.postMessage = function (message, ...args) {
      send.call(this, message, ...args);
      if (message.lines?.includes("[g] older routing settings")) {
        // Change settings in the same turn, before the worker's asynchronous failure.
        document.querySelector("[data-output-rule-id=sic]").click();
      }
    };
  });
  let workerRequests = 0;
  await page.context().route("**/output-rules-worker.js*", async (route) => {
    if (++workerRequests === 1) {
      await route.fulfill({ status: 503, body: "Fixture output rules worker unavailable" });
    } else {
      await route.continue();
    }
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await page.locator("#button-output-split").click();
  await page.locator("#button-client-options").click();
  await page.getByRole("tab", { name: "Output Windows", exact: true }).click();
  await page.getByRole("tab", { name: /^Player Filters/ }).click();
  await page.getByLabel("Grid Output", { exact: true }).check();
  const sic = page.getByLabel("SIC", { exact: true });
  await expect(sic).not.toBeChecked();

  await socketFeed(page, "[g] older routing settings\n");
  await expect(sic).toBeChecked();
  await page.locator("#button-client-options-close").click();
  await expect(page.locator("#lineBuffer")).toContainText("[g] older routing settings");

  await socketFeed(page, "|C| updated routing settings\n");
  await expect(page.locator("#secondaryBuffer")).toContainText("|C| updated routing settings");
  expect(workerRequests).toBe(2);
});

test("real Find navigates backward and wraps between repeated matches on one row", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const line = "go [X]+ then [x]+ after [X]+";
  await socketFeed(page, line + "\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: line });
  await expect(row).toBeVisible();
  const input = page.locator("#inputBuffer");
  await input.press("Control+f");
  const search = page.locator("#output-find-query");
  await expect(search).toBeFocused();
  await search.fill("[X]+");
  const currentOffset = () => row.evaluate((element) => {
    const mark = element.querySelector("mark");
    if (!mark) return null;
    const before = document.createRange();
    before.selectNodeContents(element);
    before.setEndBefore(mark);
    return before.toString().length;
  });
  await expect.poll(currentOffset).toBe(3);
  await search.press("Enter");
  await expect.poll(currentOffset).toBe(13);
  const previous = page.getByRole("button", { name: "Previous match" });
  await previous.click();
  await expect.poll(currentOffset).toBe(3);
  await previous.click();
  await expect.poll(currentOffset).toBe(24);
  await expect(page.locator("#output-find-count")).toHaveText("3 of 3");
  await search.press("F3");
  await expect.poll(currentOffset).toBe(3);
  await search.press("Shift+F3");
  await expect.poll(currentOffset).toBe(24);
  await search.press("Escape");
  await expect(page.locator("#output-find")).toBeHidden();
  await expect(input).toBeFocused();
  await expect(row.locator("mark")).toHaveCount(0);
});

test("context menus: a late server profile worker cannot undo a newer Options reload", async ({ page }) => {
  await page.addInitScript(() => {
    const deferred = new WeakSet();
    const post = window.Worker.prototype.postMessage;
    const listen = window.Worker.prototype.addEventListener;
    window.Worker.prototype.postMessage = function (message, ...args) {
      if (message.type === "configure" && message.config.profiles.some(({ label }) => label === "Older GM")) {
        deferred.add(this);
      }
      return post.call(this, message, ...args);
    };
    window.Worker.prototype.addEventListener = function (type, listener, options) {
      if (type !== "message") return listen.call(this, type, listener, options);
      return listen.call(this, type, (event) => {
        if (deferred.has(this)) {
          window.releaseObsoleteProfile = () => listener(event);
        } else listener(event);
      }, options);
    };
  });
  const gm = JSON.parse(await readFile(new URL("../data/profiles/gm.json", import.meta.url), "utf8"));
  await page.route("**/profiles/gm.json", (route) => route.fulfill({ json: gm }));
  const initial = await fixtureState(page);
  await page.goto("/?entry=real");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await expect(page.locator("#context-menu-profile option")).toHaveCount(3);
  await page.locator("#button-client-options").click();
  await page.locator("#client-options-tab-context").click();
  await setContextSection(page, "advanced");

  gm.profiles[0].label = "Older GM";
  await socketFeed(page, "#$# SDWC%%CONTEXT-PROFILE%%\"gm\"\r\n");
  await page.waitForFunction(() => typeof window.releaseObsoleteProfile === "function");
  gm.profiles[0].label = "New GM";
  await page.locator("#context-menu-reload").click();
  const active = page.locator("#context-menu-active");
  await expect(active).toHaveText("Active Profile: New GM (selected by server)");

  const finalProfile = await active.evaluate(async (element) => {
    window.releaseObsoleteProfile();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    return element.textContent;
  });
  expect(finalProfile).toBe("Active Profile: New GM (selected by server)");
  await expect(page.locator("#context-menu-error")).toBeEmpty();
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
});

test("the real IDE preserves exact grammar diagnostics alongside block checks", async ({ page }) => {
  await page.context().route("**/editor/ide/", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("parser", "moo");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const before = (await fixtureState(page)).commands;
  const opened = page.waitForEvent("popup");
  await socketFeed(page, "#$# edit name: grammar fixture upload: @program #12:preview\r\nreturn 1;\r\n.\r\n");
  const ide = await opened;
  const editor = ide.locator(".ace_editor");
  await expect(editor).toBeVisible();
  const annotations = () => editor.evaluate((element) => element.env.editor.getSession().getAnnotations());
  const error = (row, column, text = "MOO syntax error") => ({ row, column, text, type: "error" });

  for (const [source, expected] of [
    ["if (1)\n!\nreturn 1;", [
      error(0, 0, "Missing endif"), error(2, 9, "Missing block terminator: endif"), error(1, 0)
    ]],
    ["return 3 4;\nif (1)\nreturn 1;", [
      error(1, 0, "Missing endif"), error(2, 9, "Missing block terminator: endif"), error(0, 9), error(1, 0)
    ]],
    ["return \"missing\nendwhile", [error(0, 0)]],
    ["if (1)\nreturn (1 + );", [
      error(0, 0, "Missing endif"), error(1, 14, "Missing block terminator: endif"), error(1, 11, "Missing identifier")
    ]]
  ]) {
    await editor.evaluate((element, source) => element.env.editor.setValue(source, -1), source);
    await expect.poll(annotations).toEqual(expected);
  }
  expect((await fixtureState(page)).commands).toEqual(before);
});

test("real output does not pause when overlapping long presses are canceled", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&as=long");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  await socketFeed(page, "Synthetic long-press target\r\n" + new URL("/fixture/hold-preview.png", page.url()).href + "\r\n");
  const row = page.locator("#lineBuffer [data-output-id]").filter({ hasText: "Synthetic long-press target" });
  await expect(row).toBeVisible();
  const pause = page.locator("#button-auto-scroll");
  await expect(pause).toHaveAttribute("aria-label", "Pause main scrolling");
  await page.clock.install();
  const hold = { pointerType: "touch", isPrimary: true, button: 0, bubbles: true };
  const assertStillFollowing = async () => {
    await page.clock.fastForward(2100);
    await expect(pause).toHaveAttribute("aria-label", "Pause main scrolling");
  };
  await row.dispatchEvent("pointerdown", { ...hold, pointerType: "mouse", button: 2 });
  await assertStillFollowing();
  const media = page.locator("#lineBuffer [data-output-media]");
  await expect(media).toBeVisible();
  await media.dispatchEvent("pointerdown", hold);
  await assertStillFollowing();
  for (const type of ["pointerup", "pointerleave"]) {
    await row.dispatchEvent("pointerdown", hold);
    await row.dispatchEvent(type, hold);
    await assertStillFollowing();
  }
  await row.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, bubbles: true });
  await row.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", isPrimary: false, button: 0, bubbles: true });
  await row.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "touch", bubbles: true });
  await row.dispatchEvent("pointercancel", { pointerId: 2, pointerType: "touch", bubbles: true });
  await page.clock.fastForward(2100);
  await expect(pause).toHaveAttribute("aria-label", "Pause main scrolling");

  await row.dispatchEvent("pointerdown", { pointerId: 3, pointerType: "touch", isPrimary: true, button: 0, bubbles: true });
  await page.clock.fastForward(2100);
  await expect(pause).toHaveAttribute("aria-label", "Resume main scrolling");
  await pause.click();
  await page.locator("#button-client-options").click();
  await page.locator("select[name=auto-scroll-toggle]").selectOption("none");
  await page.locator("#button-client-options-close").click();
  await row.dispatchEvent("pointerdown", hold);
  await assertStillFollowing();
  expect((await fixtureState(page)).commands.slice(initial.commands.length)).toEqual([]);
});

test("the real Wasm parser ignores unrelated messages and parses missing source as empty", async ({ page }) => {
  await page.goto("/");
  const replies = await page.evaluate(async () => {
    const worker = new window.Worker("/js/moo-parser-worker.js", { type: "module" });
    const received = [];
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error("Parser did not answer the fixture")), 6000);
        worker.addEventListener("error", (event) => reject(new Error(event.message)));
        worker.addEventListener("message", ({ data }) => {
          received.push(data);
          if (data.id === 1) {
            worker.postMessage({ type: "unrelated", id: 2, source: "return 2;" });
            worker.postMessage({ type: "parse", id: 3 });
          }
          if (data.id === 3) resolve(received);
        });
        worker.postMessage({ type: "parse", id: 1, source: "return 1;" });
      });
    } finally {
      window.clearTimeout(timer);
      worker.terminate();
    }
  });
  expect(replies).toEqual([{ id: 1, annotations: [] }, { id: 3, annotations: [] }]);
});

test("the real IDE restores theme and tab layout after reopening", async ({ page }) => {
  const initial = await fixtureState(page);
  await page.goto("/?entry=real&ed=ide");
  await expect.poll(async () => (await fixtureState(page)).connections).toBeGreaterThan(initial.connections);
  const connected = await fixtureState(page);
  const openEditor = async (id) => {
    const popup = page.waitForEvent("popup", { timeout: 8000 });
    await socketFeed(page, "#$# edit name: Appearance upload: @program #" + id + ":appearance\r\nreturn 12;\r\n.\r\n");
    const ide = await popup;
    await expect(ide.getByRole("tab", { name: /Appearance/ })).toBeVisible();
    return ide;
  };
  const expectAppearance = async (ide, dark, orientation) => {
    await expect(ide.locator("html")).toHaveClass(dark ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    await expect(ide.getByRole("tablist")).toHaveAttribute("aria-orientation", orientation);
    const activeOrientation = orientation === "vertical" ? "Vertical tabs (left)" : "Horizontal tabs (top)";
    await expect(ide.getByRole("button", { name: activeOrientation })).toHaveAttribute("aria-pressed", "true");
  };

  let ide = await openEditor(12);
  await expectAppearance(ide, true, "horizontal");
  await ide.getByRole("button", { name: "Switch to light mode" }).click();
  await ide.getByRole("button", { name: "Vertical tabs (left)" }).click();
  await expectAppearance(ide, false, "vertical");
  // These storage keys are shared with existing installations.
  await expect.poll(() => ide.evaluate(() => [
    window.localStorage.getItem("ide-dark"),
    window.localStorage.getItem("ide-orientation")
  ])).toEqual(["false", "left"]);
  await ide.close();

  ide = await openEditor(13);
  await expectAppearance(ide, false, "vertical");
  await ide.getByRole("button", { name: "Switch to dark mode" }).click();
  await ide.getByRole("button", { name: "Horizontal tabs (top)" }).click();
  await expectAppearance(ide, true, "horizontal");
  await ide.close();

  ide = await openEditor(14);
  await expectAppearance(ide, true, "horizontal");
  expect((await fixtureState(page)).commands).toEqual(connected.commands);
});

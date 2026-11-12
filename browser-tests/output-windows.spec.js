/* global window, document, requestAnimationFrame */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.waitForFunction(() => window.outputTest);
});

test("routing, split positions, keyboard resize and close preserve output", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() => window.outputTest.feed("before\n"));
  await page.getByRole("button", { name: "SPLIT", exact: true }).click();
  await page.getByRole("button", { name: "Configure output window" }).click();
  await page.getByRole("tab", { name: /^GM Filters/ }).click();
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

test("manual scrolling works with default preferences and resumes on arriving output", async ({ page }) => {
  await page.evaluate(() => {
    window.outputTest.manager.updateSettings({ open: true });
    return window.outputTest.feed(Array.from({ length: 2000 }, (_, i) => "scrollback row " + i).join("\n") + "\n");
  });
  const output = page.locator("#lineBuffer");
  const before = await output.evaluate((element) => element.scrollTop);
  await output.hover();
  await page.mouse.wheel(0, -600);
  await expect.poll(() => output.evaluate((element) => element.scrollTop)).toBeLessThan(before - 200);
  // Allow row measurements and resize observers to trigger subsequent renders.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await output.evaluate((element) => element.scrollTop)).toBeLessThan(before - 200);
  expect(await page.evaluate(() => window.outputTest.manager.views.main.paused)).toBe(false);
  const anchor = await page.evaluate(() => window.outputTest.manager.views.main.anchor.id);
  await page.getByRole("button", { name: "Close secondary output window" }).click();
  await expect.poll(() => page.evaluate(() => window.outputTest.manager.views.main.anchor?.id)).toBe(anchor);
  expect(await page.evaluate(() => window.outputTest.manager.views.main.following)).toBe(false);
  await page.evaluate(() => window.outputTest.feed("new arriving row\n"));
  await expect(output).toContainText("new arriving row");
  expect(await output.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(25);
});

test("single-window chrome stays at its original position and compact controls follow pane width", async ({ page }, testInfo) => {
  await expect(page.locator("#output-main-panel header")).toHaveCount(0);
  const main = await page.locator("#lineBuffer").boundingBox();
  expect(main.y).toBe(0);
  if (testInfo.project.name !== "narrow-touch") {
    await expect(page.locator("#output-main-panel > .mini-controls")).toBeVisible();
    const toolbar = await page.locator(".mini-controls").boundingBox();
    expect(toolbar.y).toBe(0);
  }
  await page.evaluate(() => window.outputTest.manager.updateSettings({ open: true, secondarySize: 75 }));
  await expect(page.locator("#browser-client > .compact-controls")).toBeVisible();
  const toolbar = await page.locator(".mini-controls").boundingBox();
  const output = await page.locator("#output-workspace").boundingBox();
  expect(toolbar.y).toBeGreaterThanOrEqual(output.y + output.height - 1);
  if (testInfo.project.name !== "narrow-touch") {
    await page.evaluate(() => window.outputTest.manager.updateSettings({ secondarySize: 15 }));
    await expect(page.locator("#output-main-panel > .mini-controls")).toBeVisible();
    const buttons = await page.locator(".mini-controls > button").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().right));
    const bounds = await page.locator("#output-main-panel").boundingBox();
    expect(Math.max(...buttons)).toBeLessThanOrEqual(bounds.x + bounds.width);
  }
});

test("newest wrapped lines remain fully visible in every split direction", async ({ page }) => {
  for (const position of ["single", "right", "left", "top", "bottom"]) {
    await page.evaluate(async (position) => {
      const { manager, client, feed } = window.outputTest;
      manager.clear();
      manager.updateSettings({ open: position !== "single", position: position === "single" ? "right" : position, secondarySize: 35, selected: ["team-chat"] });
      client.buffer.style.fontSize = "18px";
      manager.refreshPresentation();
      await feed(Array.from({ length: 300 }, (_, i) => (i % 2 ? "[-][Team-Chat] " : "") + "\u001b[33mwrapped " + i + " text ".repeat(i % 12 + 1) + "\u001b[0m").join("\n") + "\nTAIL MAIN\n[-][Team-Chat] TAIL SECONDARY\n");
    }, position);
    await expect.poll(() => page.evaluate(() => {
      const { manager } = window.outputTest;
      return Object.entries(manager.views).every(([name, view]) => {
        if (name === "secondary" && !manager.isSplitOpen()) return true;
        const row = view.mounted.get(view.index.at(view.index.length - 1)?.id);
        const panel = view.element.getBoundingClientRect();
        return row && row.getBoundingClientRect().bottom <= panel.bottom - 2 && panel.bottom <= window.innerHeight;
      });
    }), { message: "last row clipped for " + position }).toBe(true);
    const input = await page.locator("#inputBuffer").boundingBox();
    expect(input.y + input.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
  }
});

test("clicking output does not add focus outlines and each pause button controls its own pane", async ({ page }) => {
  await page.evaluate(() => { window.outputTest.manager.updateSettings({ open: true }); return window.outputTest.feed("click this text\n"); });
  const row = page.locator("#lineBuffer [data-output-id]").first();
  await row.click({ position: { x: 5, y: 8 } });
  expect(await row.evaluate((element) => window.getComputedStyle(element).outlineStyle)).toBe("none");
  expect(await page.locator("#lineBuffer").evaluate((element) => window.getComputedStyle(element).outlineStyle)).toBe("none");
  await page.getByRole("button", { name: "Pause secondary scrolling", exact: true }).click();
  await page.getByRole("button", { name: "Pause main scrolling", exact: true }).click();
  expect(await page.evaluate(() => [window.outputTest.manager.views.main.paused, window.outputTest.manager.views.secondary.paused])).toEqual([true, true]);
  await page.getByRole("button", { name: "Resume main scrolling", exact: true }).click();
  expect(await page.evaluate(() => [window.outputTest.manager.views.main.paused, window.outputTest.manager.views.secondary.paused])).toEqual([false, true]);
});

test("closing a split confirms before merging history", async ({ page }) => {
  page.removeAllListeners("dialog");
  await page.evaluate(() => { window.outputTest.manager.updateSettings({ open: true, selected: ["team-chat"] }); return window.outputTest.feed("[-][Team-Chat] preserve me\n"); });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Close secondary output window" }).click();
  await expect(page.locator("#secondaryBuffer")).toContainText("preserve me");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#button-output-split").click();
  await expect(page.locator("#secondaryBuffer")).not.toBeVisible();
  await expect(page.locator("#lineBuffer")).toContainText("preserve me");
});

test("scrolling while text is selected renders old rows and copies the entire logical selection", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedOutput = text; } } });
    return window.outputTest.feed(Array.from({ length: 2000 }, (_, i) => "selected history line " + i).join("\n") + "\n");
  });
  await page.evaluate(() => {
    const { manager } = window.outputTest;
    manager.views.main.setPaused(true);
    manager.views.main.element.focus({ preventScroll: true });
    const row = manager.views.main.mounted.get(2000);
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
    const id = Number(row.dataset.outputId);
    const parts = [];
    for (let n = id; n <= 2000; n++) parts.push("selected history line " + (n - 1));
    parts[0] = parts[0].slice(2);
    parts[parts.length - 1] = parts[parts.length - 1].slice(0, 8);
    return parts.join("\n");
  });
  await page.keyboard.press("Control+c");
  await expect.poll(() => page.evaluate(() => window.copiedOutput)).toBe(expected);
});

test("mouse drag and wheel selection crosses unmounted history without losing copied text", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedOutput = text; } } });
    return window.outputTest.feed(Array.from({ length: 2000 }, (_, i) => "drag selected line " + i).join("\n") + "\n");
  });
  const tail = await page.locator("#lineBuffer [data-output-id='2000']").boundingBox();
  const pane = await page.locator("#lineBuffer").boundingBox();
  await page.mouse.move(tail.x + 16, tail.y + tail.height / 2);
  await page.mouse.down();
  await page.mouse.move(tail.x + 75, pane.y + pane.height / 2, { steps: 8 });
  await expect.poll(() => page.evaluate(() => document.getSelection().toString().length)).toBeGreaterThan(0);
  await page.mouse.wheel(0, -5000);
  await expect.poll(() => page.evaluate(() => Math.min(...window.outputTest.manager.views.main.mounted.keys()))).toBeLessThan(1800);
  await page.mouse.move(tail.x + 65, pane.y + pane.height / 2 - 10, { steps: 3 });
  await page.mouse.up();
  const expected = await page.evaluate(() => {
    const selection = document.getSelection();
    const endpoint = (node, offset) => {
      const row = (node.nodeType === 1 ? node : node.parentElement).closest("[data-output-id]");
      const prefix = document.createRange();
      prefix.selectNodeContents(row);
      prefix.setEnd(node, offset);
      return { id: Number(row.dataset.outputId), offset: prefix.toString().length };
    };
    const endpoints = [endpoint(selection.anchorNode, selection.anchorOffset), endpoint(selection.focusNode, selection.focusOffset)]
      .sort((a, b) => a.id - b.id || a.offset - b.offset);
    const parts = [];
    for (let id = endpoints[0].id; id <= endpoints[1].id; id++) parts.push("drag selected line " + (id - 1));
    parts[parts.length - 1] = parts[parts.length - 1].slice(0, endpoints[1].offset);
    parts[0] = parts[0].slice(endpoints[0].offset);
    return { text: parts.join("\n"), lines: parts.length };
  });
  expect(expected.lines).toBeGreaterThan(150);
  expect(await page.locator("[data-output-id]").count()).toBeLessThan(400);
  await page.keyboard.press("Control+c");
  await expect.poll(() => page.evaluate(() => window.copiedOutput)).toBe(expected.text);
});

test("Player, GM, Coder, and Custom filter views retain selections across groups", async ({ page }) => {
  await page.locator("#button-client-options").click();
  await page.getByRole("tab", { name: "Output Windows", exact: true }).click();
  const player = page.getByRole("tab", { name: /^Player Filters/ });
  const admin = page.getByRole("tab", { name: /^GM Filters/ });
  const custom = page.getByRole("tab", { name: /^Custom Filters/ });
  await expect(player).toHaveAttribute("aria-selected", "true");
  await expect(player).toHaveText("Player Filters [0/11]");
  await expect(page.getByLabel("Grid Output", { exact: true })).toBeVisible();
  await expect(page.getByLabel("SIC", { exact: true })).toBeVisible();
  const coder = page.getByRole("tab", { name: /^Coder Filters/ });
  await expect(coder).toHaveText("Coder Filters [0/6]");
  await page.getByLabel("OOC Chat", { exact: true }).check();
  await admin.click();
  await page.getByLabel("Puppet [All]", { exact: true }).check();
  await expect(player).toHaveText("Player Filters [1/11]");
  await expect(admin).toHaveText("GM Filters [1/33]");
  await custom.click();
  await page.getByLabel("Name", { exact: true }).fill("My output");
  await page.getByLabel("Pattern (without / delimiters)", { exact: true }).fill("^my output");
  await page.getByRole("button", { name: "Add filter", exact: true }).click();
  await expect(custom).toHaveText("Custom Filters [0/1]");
  await page.getByLabel("My output", { exact: true }).check();
  await expect(custom).toHaveText("Custom Filters [1/1]");
  await player.click();
  await expect(page.getByLabel("OOC Chat", { exact: true })).toBeChecked();
  await page.locator("#output-layout").selectOption("right");
  await page.locator("#button-client-options-close").click();
  await page.evaluate(() => window.outputTest.feed("[-][OOC-Chat] player line\n[p2 puppet line\nmy output line\n"));
  await expect(page.locator("#secondaryBuffer")).toContainText("player line");
  await expect(page.locator("#secondaryBuffer")).toContainText("puppet line");
  await expect(page.locator("#secondaryBuffer")).toContainText("my output line");
});

test("double-clicking either output pane toggles pause and restores the input cursor", async ({ page }) => {
  await page.evaluate(() => {
    window.outputTest.manager.updateSettings({ open: true, position: "bottom", selected: ["ooc-chat"] });
    window.outputTest.client.preferences.autoScroll = "dbl";
    return window.outputTest.feed("main double click\n[-][OOC-Chat] secondary double click\n");
  });
  await page.locator("#inputBuffer").fill("unfinished command");
  for (const name of ["main", "secondary"]) {
    const output = page.locator(name === "main" ? "#lineBuffer" : "#secondaryBuffer");
    for (const paused of [true, false]) {
      await output.dblclick({ position: { x: 20, y: 40 } });
      expect(await page.evaluate((name) => window.outputTest.manager.views[name].paused, name)).toBe(paused);
      await expect(page.locator("#inputBuffer")).toBeFocused();
      await expect(page.locator("#inputBuffer")).toHaveValue("unfinished command");
    }
  }
});

test("empty secondary matches output themes on load and shows pause state before its first match", async ({ page }) => {
  await page.evaluate(() => window.outputTest.manager.updateSettings({ open: true, selected: ["ooc-chat"] }));
  const secondary = page.locator("#secondaryBuffer");
  const help = page.locator("#output-secondary-help");
  await expect(secondary).toBeVisible();
  await expect(help).toContainText("Waiting for matching output.");
  await expect(secondary).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(page.locator("#output-secondary-panel header")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  for (const theme of ["snow", "slither", "corpie", "normal"]) {
    await page.evaluate((theme) => window.outputTest.client.setClientOption("colorSet", theme), theme);
    const colors = await page.locator("#lineBuffer").evaluate((element) => {
      const style = window.getComputedStyle(element);
      return { background: style.backgroundColor, foreground: style.color };
    });
    await expect(secondary).toHaveCSS("background-color", colors.background);
    await expect(help).toHaveCSS("color", colors.foreground);
    await expect(page.locator("#output-secondary-panel")).toHaveCSS("background-color", colors.background);
    await page.reload();
    await page.waitForFunction(() => window.outputTest);
    await expect(secondary).toBeVisible();
    await expect(secondary).toHaveCSS("background-color", colors.background);
    await expect(help).toHaveCSS("color", colors.foreground);
  }
  await page.getByRole("button", { name: "Pause secondary scrolling", exact: true }).click();
  await expect(secondary).toHaveCSS("border-top-style", "dashed");
  await expect(secondary).toHaveCSS("border-top-color", "rgb(255, 0, 0)");
  await page.evaluate(() => window.outputTest.feed("[-][OOC-Chat] first matching message\n"));
  await expect(help).not.toBeVisible();
  await expect(secondary).toHaveCSS("border-top-style", "dashed");
  await expect(secondary).toContainText("first matching message");
  const first = await secondary.locator("[data-output-id]").first().boundingBox();
  const header = await page.locator("#output-secondary-panel header").boundingBox();
  expect(first.y).toBeGreaterThanOrEqual(header.y + header.height);
});

test("compact toolbar keeps Log and Pause visible without horizontal scrolling and unread count precedes Split", async ({ page }, testInfo) => {
  if (testInfo.project.name !== "narrow-touch") await page.setViewportSize({ width: 600, height: 700 });
  await page.evaluate(() => window.outputTest.manager.updateSettings({ open: true, secondarySize: 70 }));
  const bar = page.locator(".compact-controls");
  await expect(bar).toBeVisible();
  await expect(page.locator("#button-save-mini .hidden-xs")).toBeVisible();
  await expect(page.locator("#button-auto-scroll .hidden-xs")).toBeVisible();
  const buttons = await bar.locator(":scope > button").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    const parent = element.parentElement.getBoundingClientRect();
    return { id: element.id, inside: box.left >= parent.left && box.right <= parent.right + 1 && box.top >= parent.top && box.bottom <= parent.bottom + 1 };
  }));
  expect(buttons.every((button) => button.inside)).toBe(true);
  expect(await bar.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "Pause main scrolling", exact: true }).click();
  await page.evaluate(() => window.outputTest.feed("unread one\nunread two\n"));
  const unread = page.locator(".mini-controls [data-output-unread=main]");
  await expect(unread).toHaveText("2 unread");
  const location = await unread.evaluate((element) => {
    const split = document.querySelector("#button-output-split");
    return { next: element.nextElementSibling.id, left: element.getBoundingClientRect().right <= split.getBoundingClientRect().left };
  });
  expect(location).toEqual({ next: "button-output-split", left: true });
});

test("filter checkboxes use three responsive columns without overflowing their pane", async ({ page }) => {
  await page.locator("#button-client-options").click();
  await page.getByRole("tab", { name: "Output Windows", exact: true }).click();
  await page.getByRole("tab", { name: /^GM Filters/ }).click();
  for (const [width, expectedColumns] of [[1200, 3], [650, 2], [360, 1]]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.locator("#output-presets").evaluate((element) => window.getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(expectedColumns);
    const layout = await page.locator("#output-presets").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const boxes = [...element.children].map((row) => row.getBoundingClientRect());
      return {
        topRow: boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 1).length,
        inside: boxes.every((box) => box.left >= bounds.left && box.right <= bounds.right + 1)
      };
    });
    expect(layout).toEqual({ topRow: expectedColumns, inside: true });
  }
});

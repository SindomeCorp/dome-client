/* global window, document, requestAnimationFrame */
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.waitForFunction(() => window.outputTest);
});

test("game-neutral default exposes only Channels and routes any anchored channel prefix", async ({ page }) => {
  await page.goto("/?presets=default");
  await page.waitForFunction(() => window.outputTest);
  await page.locator("#button-client-options").click();
  await page.getByRole("tab", { name: "Output Windows", exact: true }).click();
  await expect(page.getByRole("tab", { name: /^Player Filters/ })).toHaveText("Player Filters [0/1]");
  await page.getByLabel("Channels", { exact: true }).check();
  await expect(page.getByRole("tab", { name: /^GM Filters/ })).toHaveText("GM Filters [0/0]");
  await expect(page.getByRole("tab", { name: /^Coder Filters/ })).toHaveText("Coder Filters [0/0]");
  await page.locator("#button-client-options-close").click();
  await page.locator("#button-output-split").click();
  await page.evaluate(() => window.outputTest.feed("[-][Example] routed\n[-] also routed\n[+][Example] primary routed\n[+] also routed\nbefore [-] stays main\nbefore [+] stays main\n"));
  await expect(page.locator("#secondaryBuffer")).toContainText("[-][Example] routed");
  await expect(page.locator("#secondaryBuffer")).toContainText("[-] also routed");
  await expect(page.locator("#secondaryBuffer")).toContainText("[+][Example] primary routed");
  await expect(page.locator("#secondaryBuffer")).toContainText("[+] also routed");
  await expect(page.locator("#lineBuffer")).toContainText("before [-] stays main");
  await expect(page.locator("#lineBuffer")).toContainText("before [+] stays main");
});

async function copyThroughNativeEvent(page, expected) {
  await expect.poll(async () => {
    await page.keyboard.press("Control+c");
    return page.evaluate(() => window.copiedOutput);
  }).toBe(expected);
  await page.evaluate(() => {
    const textarea = document.createElement("textarea");
    textarea.id = "clipboard-verification";
    document.body.append(textarea);
    textarea.focus();
  });
  await page.keyboard.press("Control+v");
  await expect(page.locator("#clipboard-verification")).toHaveValue(expected);
}

async function popOut(page) {
  const opened = page.waitForEvent("popup");
  await page.locator("#button-output-popout").click();
  const popup = await opened;
  await expect(page.locator("#button-output-split")).toHaveText("REDOCK");
  await expect(popup.locator("#button-output-redock")).toBeVisible();
  return popup;
}

async function redockCompanion(popup) {
  await popup.locator("#button-output-redock").click().catch((error) => {
    if (!popup.isClosed()) throw error; // Firefox may close it before click acknowledgement.
  });
}

test("cross-origin navigation without a lifecycle notification redocks and retains incoming output", async ({ page }) => {
  const otherOrigin = createServer((_req, response) => response.end("Another origin"));
  await new Promise((resolve) => otherOrigin.listen(0, "127.0.0.1", resolve));
  try {
    for (const emptyPaused of [false, true]) {
      await page.evaluate(async (empty) => {
        const { manager, client } = window.outputTest;
        manager.clear();
        manager.updateSettings({ open: true, selected: ["team-chat"] });
        if (empty) manager.views.secondary.setPaused(true);
        else { client.parseSocketData("main\n[-][Team-Chat] before\n"); await manager.idle(); }
        window.navigationIndex = manager.views.secondary.index;
      }, emptyPaused);
      const popup = await popOut(page);
      await popup.evaluate(() => {
        window.addEventListener("pagehide", (event) => event.stopImmediatePropagation(), { capture: true });
      });
      await popup.goto("http://127.0.0.1:" + otherOrigin.address().port);
      const state = await page.evaluate(async () => {
        const { client, manager } = window.outputTest;
        client.parseSocketData("[-][Team-Chat] after navigation\n");
        await manager.idle();
        return { detached: manager.popout.isDetached(), retained: manager.history.length, sameIndex: manager.views.secondary.index === window.navigationIndex };
      });
      expect(state).toEqual({ detached: false, retained: emptyPaused ? 1 : 3, sameIndex: true });
      await expect(page.locator("#secondaryBuffer")).toContainText("after navigation");
      await expect.poll(() => popup.isClosed()).toBe(true);
    }
  } finally { await new Promise((resolve) => otherOrigin.close(resolve)); }
});

test("secondary presentation supplied by a URL agrees with controls, exported preferences and later visits", async ({ page }) => {
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/?of=menlo&cl=acid&oz=14&sof=courier&scl=snow&soz=18");
  await page.waitForFunction(() => window.outputTest);
  await page.locator("#button-client-options").click();
  await page.getByRole("tab", { name: "Presentation", exact: true }).click();
  await page.getByRole("tab", { name: "Secondary Window", exact: true }).click();
  await expect(page.locator("#secondaryoutfont-option select")).toHaveValue("courier");
  await expect(page.locator("#secondarycolorset-option select")).toHaveValue("snow");
  await expect(page.locator("#secondaryoutfontsize-option input")).toHaveValue("18");
  await page.getByRole("tab", { name: "Import/Export", exact: true }).click();
  const saved = page.waitForEvent("download");
  await page.locator("#client-options-export").click();
  let json = "";
  for await (const chunk of await (await saved).createReadStream()) json += chunk;
  const prefs = JSON.parse(json).preferences;
  expect([prefs.secondaryoutfont, prefs.secondarycolorset, prefs.secondaryoutfontsize]).toEqual(["courier", "snow", 18]);
  await page.evaluate(() => window.outputTest.client.setClientOption("secondaryLineBufferFont", "lucida"));
  await page.locator("#client-options-import-file").setInputFiles({ name: "url-options.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await page.goto("/");
  await page.waitForFunction(() => window.outputTest);
  expect(await page.evaluate(() => {
    const prefs = window.outputTest.client.preferences;
    return [prefs.secondaryLineBufferFont, prefs.secondaryColorSet, prefs.secondaryLineBufferFontSizePt];
  })).toEqual(["courier", "snow", 18]);
});

test("exported logs keep large wrapped and nowrap fonts readable with embedded or linked CSS", async ({ page }) => {
  const { css, logs } = await page.evaluate(async () => {
    const { manager, client, feed, exportSnapshot } = window.outputTest;
    client.preferences.sdwcNowrapBlocks = true;
    await feed("FIRST_BIG_LINE\n" + "wrapped words ".repeat(60) + "\n#$# SDWC-START-NOWRAP\nNOWRAP_ONE\nNOWRAP_TWO\n#$# SDWC-END-NOWRAP\nLAST_BIG_LINE\n");
    const logs = [];
    for (const font of ["standard", "courier"]) {
      client.preferences.lineBufferFont = font;
      client.preferences.lineBufferFontSizePt = 24;
      for (const inlineCss of [true, false]) logs.push((await exportSnapshot(await manager.snapshot(), { client, css: window.__LOG_EXPORT_CSS__, inlineCss })).join(""));
    }
    return { css: window.__LOG_EXPORT_CSS__, logs };
  });
  await page.route("https://**/*", (route) => route.abort());
  await page.route("https://play.sindome.org/css/client.css", (route) => route.fulfill({ contentType: "text/css", body: css }));
  for (const html of logs) {
    await page.goto("about:blank");
    await page.setContent(html);
    const layout = await page.evaluate(() => {
      const buffer = document.querySelector("#lineBuffer");
      const rows = [...buffer.querySelectorAll(":scope > div:not(.sdwc-nowrap-block), :scope > .sdwc-nowrap-block > div")];
      const boxes = rows.flatMap((row) => {
        const range = document.createRange();
        range.selectNodeContents(row);
        return [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0).map((box) => ({ top: box.top, bottom: box.bottom }));
      });
      // Chromium can return separate rectangles for text and trailing spaces
      // on the same visual line. Compare distinct lines, not those fragments.
      const lines = boxes.filter((box, index) => index === 0 || Math.abs(box.top - boxes[index - 1].top) > 1);
      return { fontSize: window.getComputedStyle(buffer).fontSize, lineHeight: window.getComputedStyle(buffer).lineHeight,
        overlapping: lines.filter((box, index) => index > 0 && box.top < lines[index - 1].bottom - 1), lines: lines.length };
    });
    expect(layout.fontSize).toBe("32px");
    expect(layout.lineHeight).toBe("40px");
    expect(layout.lines).toBeGreaterThan(6);
    expect(layout.overlapping).toEqual([]);
  }
});

test("the editor list stays hidden for IDE payloads and only shows live individual editor windows", async ({ page }) => {
  await page.evaluate(async () => {
    const { client, manager } = window.outputTest;
    window.fixtureIdeOpens = 0;
    client.openIDE = () => { window.fixtureIdeOpens++; };
    client.parseSocketData("#$# edit name: ide-one upload: @program foo\nline1\n.\n");
    await manager.idle();
    client.parseSocketData("#$# edit name: ide-two upload: @program foo\nline2\n");
    await manager.idle();
    client.parseSocketData(".\n");
    await manager.idle();
  });
  await expect(page.locator("#editor-list-view")).not.toBeVisible();
  expect(await page.evaluate(() => window.fixtureIdeOpens)).toBe(2);
  const opened = page.waitForEvent("popup");
  await page.evaluate(async () => {
    const { client, manager } = window.outputTest;
    client.preferences.editorType = "windows";
    client.parseSocketData("#$# edit name: individual upload: @program foo\nline3\n.\n");
    await manager.idle();
  });
  const editor = await opened;
  await expect(page.locator("#editor-list-view li")).toHaveCount(1);
  await expect(page.locator("#editor-list-view")).toContainText("individual");
  await page.locator("#editor-list-view a").click();
  await expect.poll(() => editor.isClosed()).toBe(true);
  await expect(page.locator("#editor-list-view")).not.toBeVisible();
});

test("presentation tabs save independent secondary display settings and keep logs styled as main", async ({ page }) => {
  await page.locator("#button-client-options").click();
  await page.getByRole("tab", { name: "Presentation", exact: true }).click();
  await page.locator("#outfont-option select").selectOption("menlo");
  await page.locator("#colorset-option select").selectOption("acid");
  await page.getByRole("tab", { name: "Secondary Window", exact: true }).click();
  await expect(page.locator("#presentation-panel-secondary")).toContainText("Saved logs use Main Window presentation settings.");
  await expect(page.locator("#secondaryoutfont-option select")).toHaveValue("standard");
  await page.locator("#secondaryoutfont-option select").selectOption("courier");
  await page.locator("#secondarycolorset-option select").selectOption("snow");
  await page.locator("#secondaryoutfontsize-option input").fill("16");
  await page.locator("#secondaryoutfontsize-option input").press("Tab");
  await page.locator("#presentation-tab-secondary").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#presentation-tab-main")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#client-options-tab-fonts")).toHaveAttribute("aria-selected", "true");
  await page.locator("#outfontsize-option input").fill("12");
  await page.locator("#outfontsize-option input").press("Tab");
  await page.locator("#button-client-options-close").click();
  await page.reload();
  await page.waitForFunction(() => window.outputTest);
  await page.evaluate(async () => {
    window.outputTest.manager.updateSettings({ open: true, selected: ["team-chat"] });
    await window.outputTest.feed("MAIN_PRESENTATION\n[-][Team-Chat] SECONDARY_PRESENTATION\n");
  });
  await expect(page.locator("#secondaryBuffer")).toHaveClass(/courierText.*colorset-snow/);
  await expect(page.locator("#secondaryBuffer")).toHaveCSS("background-color", "rgb(226, 226, 226)");
  await expect(page.locator("#secondaryBuffer")).toHaveCSS("font-size", "21.3333px");
  const popup = await popOut(page);
  await expect(popup.locator("#secondaryBuffer")).toHaveClass(/courierText.*colorset-snow/);
  await expect(popup.locator("#secondaryBuffer")).toHaveCSS("background-color", "rgb(226, 226, 226)");
  const saved = page.waitForEvent("download");
  await page.locator("#button-save-mini").click();
  let html = "";
  for await (const chunk of await (await saved).createReadStream()) html += chunk;
  expect(html).toContain("id=\"lineBuffer\" class=\"menloText colorset-acid\" style=\"font-size:12pt;line-height:15pt\"");
  expect(html).toContain("SECONDARY_PRESENTATION");
  await popup.locator("[data-output-configure]").click();
  await page.getByRole("tab", { name: "Import/Export", exact: true }).click();
  const exported = page.waitForEvent("download");
  await page.locator("#client-options-export").click();
  let json = "";
  for await (const chunk of await (await exported).createReadStream()) json += chunk;
  expect(JSON.parse(json).preferences.secondaryoutfont).toBe("courier");
  await page.locator("#client-options-import-file").setInputFiles({ name: "older-options.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ preferences: { outfont: "lucida", colorset: "slither", outfontsize: 10 } })) });
  await expect(popup.locator("#secondaryBuffer")).toHaveClass(/lucidaText.*colorset-slither/);
  await expect(popup.locator("#secondaryBuffer")).toHaveCSS("font-size", "13.3333px");
  await page.locator("#client-options-import-file").setInputFiles({ name: "new-options.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.locator("#secondaryBuffer")).toHaveClass(/courierText.*colorset-snow/);
  await page.locator("#client-options-reset-defaults").click();
  await expect.poll(() => popup.isClosed()).toBe(true);
  expect(await page.evaluate(() => window.outputTest.client.preferences.secondaryLineBufferFont)).toBe("standard");
  await page.reload();
  await page.waitForFunction(() => window.outputTest);
  expect(await page.evaluate(() => window.outputTest.client.preferences.secondaryColorSet)).toBe("normal");
});

test("grid nowrap blocks route intact through docked and popped-out views and unified logs", async ({ page }) => {
  await page.evaluate(async () => {
    const { manager, client, feed } = window.outputTest;
    client.preferences.sdwcNowrapBlocks = true;
    manager.updateSettings({ open: true, selected: ["grid-output"] });
    await feed("before grid\n#$# SDWC-START-NOWRAP\n\n\u001b[32m[g] GRID_HEADER " + "column ".repeat(100) + "\u001b[0m\n[g] GRID_BODY " + "column ".repeat(100) + "\n");
  });
  await expect(page.locator("#secondaryBuffer")).toContainText("GRID_HEADER");
  await expect(page.locator("#lineBuffer")).not.toContainText("GRID_HEADER");
  const rows = page.locator("#secondaryBuffer .output-nowrap-row");
  await expect(rows).toHaveCount(3);
  await rows.nth(1).evaluate((row) => { row.scrollLeft = 80; });
  await expect.poll(() => rows.nth(2).evaluate((row) => row.scrollLeft)).toBe(80);
  const popup = await popOut(page);
  await expect(popup.locator("#secondaryBuffer")).toContainText("GRID_BODY");
  await page.evaluate(() => window.outputTest.feed("[g] GRID_TAIL\n#$# SDWC-END-NOWRAP\nafter grid\n"));
  await expect(popup.locator("#secondaryBuffer")).toContainText("GRID_TAIL");
  await redockCompanion(popup);
  await expect(page.locator("#secondaryBuffer .output-nowrap-row")).toHaveCount(4);
  const downloading = page.waitForEvent("download");
  await page.locator("#button-save-mini").click();
  const stream = await (await downloading).createReadStream();
  let html = "";
  for await (const chunk of stream) html += chunk;
  expect(html).toContain("sdwc-nowrap-block");
  expect(html).toContain("xterm256-Green");
  const labels = ["before grid", "GRID_HEADER", "GRID_BODY", "GRID_TAIL", "after grid"];
  for (let i = 1; i < labels.length; i++) expect(html.indexOf(labels[i])).toBeGreaterThan(html.indexOf(labels[i - 1]));
  for (const label of labels) expect(html.split(label)).toHaveLength(2);
  await page.locator("#button-output-split").click();
  await expect(page.locator("#lineBuffer")).toContainText("GRID_TAIL");
});

test("pop-out transfers one secondary index and preserves paused history through repeated redocking", async ({ page, browserName }) => {
  await page.evaluate(async () => {
    const { manager, feed } = window.outputTest;
    manager.updateSettings({ open: true, position: "left", secondarySize: 40, selected: ["team-chat"] });
    for (let start = 0; start < 20_000; start += 2500) {
      await feed(Array.from({ length: 2500 }, (_, i) => "[-][Team-Chat] transfer " + (start + i)).join("\n") + "\n");
    }
    manager.views.secondary.jump(500);
    window.transferIndex = manager.views.secondary.index;
    window.transferGeneration = manager.generation;
    await feed("[-][Team-Chat] unread after pause\nmain after pause\n");
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const popup = await popOut(page);
    expect(await page.evaluate(() => {
      const { manager } = window.outputTest;
      return { sameIndex: manager.views.secondary.index === window.transferIndex, sameGeneration: manager.generation === window.transferGeneration,
        paused: manager.views.secondary.paused, unread: manager.views.secondary.unread, anchor: manager.views.secondary.anchor.id };
    })).toEqual({ sameIndex: true, sameGeneration: true, paused: true, unread: 1, anchor: 500 });
    await expect(page.locator("#output-divider")).not.toBeVisible();
    expect(await popup.locator("[data-output-id]").count()).toBeLessThan(400);
    await page.evaluate(() => {
      const view = window.outputTest.manager.views.secondary;
      window.retiredOutputHosts ||= [];
      window.retiredOutputHosts.push(new WeakRef(view), new WeakRef(view.element.ownerDocument));
    });
    if (attempt === 0) await redockCompanion(popup);
    else if (attempt === 1) await page.locator("#button-output-split").click();
    else await popup.close();
    await expect(page.locator("#output-secondary-panel")).toBeVisible();
    await expect(page.locator("#output-workspace")).toHaveAttribute("data-position", "left");
    expect(await page.evaluate(() => window.outputTest.manager.views.secondary.index === window.transferIndex)).toBe(true);
  }
  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await expect.poll(async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      return page.evaluate(() => window.retiredOutputHosts.filter((reference) => reference.deref()).length);
    }, { message: "closed companion documents and retired renderers must be collectible" }).toBe(0);
    await cdp.detach();
  }
});

test("companion Find, filters, themes, media, pruning and clearing use the shared session", async ({ page }) => {
  await page.route("https://media.example/popout.png", (route) => route.fulfill({ contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'></svg>" }));
  await page.evaluate(async () => {
    const { manager, feed, client } = window.outputTest;
    client.preferences.imagePreview = true;
    manager.updateSettings({ open: true, selected: ["team-chat"] });
    await feed("main before\n[-][Team-Chat] https://media.example/popout.png\n" + Array.from({ length: 1000 }, (_, i) => "[-][Team-Chat] find row " + i).join("\n") + "\n");
  });
  const popup = await popOut(page);
  await popup.locator("#button-output-find").click();
  await popup.locator("#output-find-query").fill("find row 123");
  await expect(popup.locator("mark")).toHaveText("find row 123");
  await popup.locator("#output-find-query").press("Escape");
  await popup.locator("[data-output-configure]").click();
  await expect(page.locator("#client-options-tab-output")).toHaveAttribute("aria-selected", "true");
  await page.locator("#button-client-options-close").click();
  await page.evaluate(() => {
    const { manager, client } = window.outputTest;
    client.buffer.classList.remove("colorset-acid");
    client.buffer.classList.add("colorset-snow");
    client.preferences.secondaryColorSet = "snow";
    manager.refreshPresentation();
    manager.views.secondary.jump(2);
  });
  await expect(popup.locator("#secondaryBuffer")).toHaveClass(/colorset-snow/);
  await expect(popup.locator("img")).toHaveCount(0);
  await popup.locator("[data-output-media]").click();
  await expect(popup.locator("img")).toHaveCount(1);
  await page.evaluate(() => {
    const { manager, client } = window.outputTest;
    client.preferences.performanceBuffer = 5;
    manager.prune();
  });
  await expect(popup.locator("img")).toHaveCount(0);
  await page.evaluate(() => window.outputTest.manager.clear());
  await expect(popup.locator("#output-secondary-help")).toContainText("Waiting for matching output.");
  expect(await page.evaluate(() => window.outputTest.manager.history.length)).toBe(0);
  await popup.close();
});

test("main Find locates popped-out output and reload closes the companion without restoring a popup", async ({ page }) => {
  await page.evaluate(async () => {
    window.outputTest.manager.updateSettings({ open: true, selected: ["team-chat"] });
    await window.outputTest.feed("main\n[-][Team-Chat] needle in companion\n");
  });
  const popup = await popOut(page);
  await page.locator("#button-output-find").click();
  await page.locator("#output-find-query").fill("needle in companion");
  await expect(popup.locator("mark")).toHaveText("needle in companion");
  await page.reload();
  await page.waitForFunction(() => window.outputTest);
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.locator("#output-secondary-panel")).toBeVisible();
  await expect(page.locator("#button-output-split")).toHaveText("CLOSE SPLIT");
});

test("blocked pop-outs retain the split and native app bridges hide the launch control", async ({ page }) => {
  await page.evaluate(() => {
    window.outputTest.manager.updateSettings({ open: true });
    window.open = () => null;
  });
  await page.locator("#button-output-popout").click();
  await expect(page.locator("#output-secondary-panel")).toBeVisible();
  expect(await page.evaluate(() => window.lastOutputStatus)).toContain("blocked");
  await page.evaluate(() => {
    window.DomeNative = { sendInput() {} };
    window.outputTest.manager.popout.refresh();
  });
  await expect(page.locator("#button-output-popout")).not.toBeVisible();
});

test("companion copies unmounted history and updates while main is in the background", async ({ page }) => {
  await page.evaluate(async () => {
    window.outputTest.manager.updateSettings({ open: true, selected: ["team-chat"] });
    await window.outputTest.feed(Array.from({ length: 2000 }, (_, i) => "[-][Team-Chat] copy " + i).join("\n") + "\n");
  });
  const popup = await popOut(page);
  const expected = await popup.evaluate(() => {
    const view = window.opener.outputTest.manager.views.secondary;
    Object.defineProperty(window.navigator, "clipboard", { get() { throw new Error("Async clipboard must not be used"); } });
    document.addEventListener("copy", (event) => { window.copiedOutput = event.clipboardData.getData("text/plain"); });
    view.setPaused(true);
    view.element.focus();
    const tail = view.mounted.get(2000).firstChild;
    document.getSelection().setBaseAndExtent(tail, 2, tail, 8);
    view.element.scrollTop = 0;
    view.onScroll(); view.render();
    document.getSelection().setBaseAndExtent(tail, 8, view.mounted.get(1).firstChild, 2);
    const parts = Array.from({ length: 2000 }, (_, i) => "[-][Team-Chat] copy " + i);
    parts[0] = parts[0].slice(2);
    parts[1999] = parts[1999].slice(0, 8);
    return parts.join("\n");
  });
  await copyThroughNativeEvent(popup, expected);
  await popup.evaluate(() => {
    document.getSelection().removeAllRanges();
    window.opener.outputTest.manager.views.secondary.setPaused(false);
  });
  await popup.bringToFront();
  await page.evaluate(async () => {
    const { client, manager } = window.outputTest;
    client.parseSocketData("[-][Team-Chat] background main arrival\n");
    await manager.idle();
  });
  await expect(popup.locator("#secondaryBuffer")).toContainText("background main arrival");
  await popup.close();
});

test("refreshing the companion redocks it and closing secondary entirely still confirms and merges", async ({ page }) => {
  await page.evaluate(async () => {
    window.outputTest.manager.updateSettings({ open: true, selected: ["team-chat"] });
    await window.outputTest.feed("first\n[-][Team-Chat] second\nthird\n");
  });
  let popup = await popOut(page);
  await popup.evaluate(() => { window.setTimeout(() => window.location.reload(), 0); });
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.locator("#output-secondary-panel")).toBeVisible();
  popup = await popOut(page);
  await page.locator("#button-client-options").click();
  await page.getByRole("tab", { name: "Output Windows", exact: true }).click();
  page.removeAllListeners("dialog");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#output-layout").selectOption("single");
  expect(popup.isClosed()).toBe(false);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#output-layout").selectOption("single");
  await expect.poll(() => popup.isClosed()).toBe(true);
  expect(await page.evaluate(() => window.outputTest.manager.views.main.index.length)).toBe(3);
});

test("cancelling main navigation preserves its live companion", async ({ page }) => {
  test.setTimeout(15_000);
  await page.evaluate(() => window.outputTest.manager.updateSettings({ open: true }));
  const popup = await popOut(page);
  await page.evaluate(() => window.addEventListener("beforeunload", (event) => {
    event.preventDefault(); event.returnValue = "";
  }));
  page.removeAllListeners("dialog");
  const prompted = page.waitForEvent("dialog");
  const navigation = page.evaluate(() => { window.setTimeout(() => window.location.reload(), 0); });
  const dialog = await prompted;
  await dialog.dismiss();
  await navigation;
  expect(popup.isClosed()).toBe(false);
  expect(await page.evaluate(() => window.outputTest.manager.popout.isDetached())).toBe(true);
  await redockCompanion(popup);
  page.on("dialog", (dialog) => dialog.accept());
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
  await page.evaluate(() => window.outputTest.feed("main one\n\u001b[31m[-][Team-Chat] chat\u001b[0m\n[+][Team-Chat] primary chat\nmain two\n"));
  await expect(page.locator("#secondaryBuffer")).toContainText("[-][Team-Chat] chat");
  await expect(page.locator("#secondaryBuffer")).toContainText("[+][Team-Chat] primary chat");
  await expect(page.locator("#lineBuffer")).not.toContainText("[-][Team-Chat] chat");
  await expect(page.locator("#lineBuffer")).not.toContainText("[+][Team-Chat] primary chat");
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

for (const mode of ["single", "split", "disabled"]) {
  for (const autoPause of [false, true]) {
    test("small wheel movements and slow touch leave the tail: " + mode + ", auto-pause " + autoPause, async ({ page }, testInfo) => {
      if (mode === "disabled") {
        await page.goto("/?splits=off");
        await page.waitForFunction(() => window.outputTest);
      }
      await page.evaluate(async ({ mode, autoPause }) => {
        const { manager, client, feed } = window.outputTest;
        client.preferences.scrollUpToPause = autoPause;
        manager.updateSettings({ open: mode === "split", position: "bottom", secondarySize: 35, selected: ["team-chat"] });
        await feed(Array.from({ length: 600 }, (_, i) => "scroll row " + i + "\n[-][Team-Chat] chat " + i).join("\n") + "\n");
      }, { mode, autoPause });
      for (const panel of mode === "split" ? ["main", "secondary"] : ["main"]) {
        const output = page.locator(panel === "main" ? "#lineBuffer" : "#secondaryBuffer");
        const state = () => page.evaluate((panel) => {
          const view = window.outputTest.manager.views[panel];
          return { paused: view.paused, following: view.following, distance: view.element.scrollHeight - view.element.clientHeight - view.element.scrollTop };
        }, panel);
        await output.hover();
        for (let i = 1; i <= 3; i++) {
          await page.mouse.wheel(0, -5);
          await expect.poll(state).toMatchObject({ paused: autoPause, following: false });
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await expect.poll(async () => (await state()).distance).toBeGreaterThanOrEqual(i * 4);
        }
        await page.mouse.wheel(0, 5);
        await expect.poll(state).toMatchObject({ paused: false, following: true });
        await expect.poll(async () => (await state()).distance).toBeLessThan(2);
        if (testInfo.project.name === "narrow-touch") {
          const touch = await page.context().newCDPSession(page);
          const box = await output.boundingBox();
          const point = { x: box.x + box.width / 2, y: box.y + box.height / 4 };
          await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
          for (let step = 1; step <= 12; step++) {
            await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...point, y: point.y + step * 10 }] });
            await page.waitForTimeout(20);
          }
          await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await touch.detach();
          await expect.poll(state).toMatchObject({ paused: autoPause, following: false });
          expect((await state()).distance).toBeGreaterThan(60);
          expect(await page.locator("[data-output-id]").count()).toBeLessThan(400);
          // Let native touch inertia finish before testing a later arrival or
          // wheel gesture. Its remaining upward movement is still user input.
          let previous;
          let stable = 0;
          await expect.poll(async () => {
            const top = await output.evaluate((element) => element.scrollTop);
            stable = top === previous ? stable + 1 : 0;
            previous = top;
            return stable;
          }, { intervals: [50] }).toBeGreaterThanOrEqual(3);
        } else {
          await page.mouse.wheel(0, -10);
          await expect.poll(state).toMatchObject({ paused: autoPause, following: false });
        }
        // Arrivals retain the existing preference: follow when automatic
        // pausing is off, or hold the scrollback anchor when it is on.
        await page.evaluate(() => window.outputTest.feed("new scroll main\n[-][Team-Chat] new scroll chat\n"));
        await expect.poll(state).toMatchObject({ paused: autoPause, following: !autoPause });
        if (autoPause) {
          expect((await state()).distance).toBeGreaterThan(5);
          await output.hover();
          await page.mouse.wheel(0, 100_000);
          await expect.poll(state).toMatchObject({ paused: false, following: true });
        }
        await expect.poll(async () => (await state()).distance).toBeLessThan(2);
      }
    });
  }
}

test("native scrollbar up-arrow enters scrollback without bouncing", async ({ page, browserName, headless }, testInfo) => {
  test.skip(browserName !== "chromium" || headless || testInfo.project.name === "narrow-touch" || process.platform !== "linux",
    "Requires headed Linux Chromium's native scrollbar arrows; run under xvfb-run with --headed.");
  for (const mode of ["single", "split", "disabled"]) {
    for (const autoPause of [false, true]) {
      await page.goto(mode === "disabled" ? "/?splits=off" : "/");
      await page.waitForFunction(() => window.outputTest);
      await page.evaluate(async ({ mode, autoPause }) => {
        const { manager, client, feed } = window.outputTest;
        manager.clear();
        client.preferences.scrollUpToPause = autoPause;
        manager.updateSettings({ open: mode === "split", position: "bottom", secondarySize: 35, selected: ["team-chat"] });
        for (const view of Object.values(manager.views)) view.setPaused(false);
        await feed(Array.from({ length: 1000 }, (_, i) => "arrow row " + i + "\n[-][Team-Chat] arrow chat " + i).join("\n") + "\n");
      }, { mode, autoPause });
      for (const panel of mode === "split" ? ["main", "secondary"] : ["main"]) {
        const output = page.locator(panel === "main" ? "#lineBuffer" : "#secondaryBuffer");
        // Coordinate-based native controls must be painted after layout settles.
        await page.screenshot();
        await expect.poll(() => output.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(2);
        const arrow = await output.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const right = parseFloat(style.borderRightWidth);
          const width = element.offsetWidth - element.clientWidth - parseFloat(style.borderLeftWidth) - right;
          const x = rect.right - right - width / 2;
          const y = rect.top + parseFloat(style.borderTopWidth) + width / 2;
          return { width, x, y, top: element.scrollTop, hit: document.elementFromPoint(x, y)?.tagName };
        });
        expect(arrow.width, "classic scrollbar must be visible for a native arrow click").toBeGreaterThan(0);
        for (let click = 1; click <= 3; click++) {
          await output.hover();
          await page.mouse.click(arrow.x, arrow.y, { delay: 50 });
          expect(await page.evaluate(() => window.outputTest.manager.isSplitOpen()), "the arrow must not hit the split's Close button").toBe(mode === "split");
          await expect.poll(() => page.evaluate((panel) => {
            const view = window.outputTest.manager.views[panel];
            return { following: view.following, paused: view.paused };
          }, panel), { message: "native arrow: " + mode + "/" + panel + ", auto-pause " + autoPause + ", click " + click + ", " + JSON.stringify(arrow) })
            .toEqual({ following: false, paused: autoPause });
          await expect.poll(() => output.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight))
            .toBeGreaterThan(click * 20);
        }
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        expect(await output.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeGreaterThan(60);
      }
    }
  }
});

test("collapsing media at the bottom does not look like an upward scrolling gesture", async ({ page }) => {
  await page.route("https://media.example/scroll-height.png", (route) => route.fulfill({
    contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='20' height='500'></svg>"
  }));
  for (const autoPause of [false, true]) {
    await page.evaluate(async (autoPause) => {
      const { manager, client, feed } = window.outputTest;
      manager.clear();
      client.preferences.scrollUpToPause = autoPause;
      client.preferences.imagePreview = true;
      await feed(Array.from({ length: 200 }, (_, i) => "media row " + i).join("\n") + "\nhttps://media.example/scroll-height.png\n");
    }, autoPause);
    await expect(page.locator("#lineBuffer img")).toBeVisible();
    await expect.poll(() => page.locator("#lineBuffer img").evaluate((image) => image.naturalHeight)).toBe(500);
    await page.locator("#lineBuffer [data-output-media]").click();
    await expect(page.locator("#lineBuffer img")).toHaveCount(0);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => {
      const view = window.outputTest.manager.views.main;
      return { following: view.following, paused: view.paused };
    })).toEqual({ following: true, paused: false });
  }
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

test("scrolling while text is selected renders old rows and copies the entire logical selection", async ({ page, browserName }) => {
  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Browser.setPermission", { permission: { name: "clipboard-write" }, setting: "denied", origin: "http://127.0.0.1:4318" });
    await cdp.detach();
  }
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, get() { throw new Error("Async clipboard is unavailable"); } });
    document.addEventListener("copy", (event) => { window.copiedOutput = event.clipboardData.getData("text/plain"); });
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
  await copyThroughNativeEvent(page, expected);
});

test("mouse drag and wheel selection crosses unmounted history without losing copied text", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, get() { throw new Error("Async clipboard is unavailable"); } });
    document.addEventListener("copy", (event) => { window.copiedOutput = event.clipboardData.getData("text/plain"); });
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
  await copyThroughNativeEvent(page, expected.text);
});

test("downloaded media previews work independently and load only when opened", async ({ page }) => {
  await page.evaluate(() => window.outputTest.feed("https://media.example/picture.png\nhttps://media.example/movie.mp4\n"));
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#button-save-mini").click();
  const stream = await (await downloadPromise).createReadStream();
  let html = "";
  for await (const chunk of stream) html += chunk;
  await page.route("https://media.example/**", (route) => route.abort());
  // Loading just the saved document must not depend on the running webclient.
  await page.goto("about:blank");
  await page.setContent(html);
  await expect(page.locator("img, video")).toHaveCount(0);
  const controls = page.locator("[data-output-media]");
  await controls.nth(0).click();
  await expect(page.locator("img")).toHaveCount(1);
  await controls.nth(0).click();
  await expect(page.locator("img")).toHaveCount(0);
  await controls.nth(1).click();
  await expect(page.locator("video source")).toHaveAttribute("src", "https://media.example/movie.mp4");
  await controls.nth(1).click();
  await expect(page.locator("video")).toHaveCount(0);
});

test("Player, GM, Coder, and Custom filter views retain selections across groups", async ({ page }) => {
  await page.locator("#button-client-options").click();
  await page.getByRole("tab", { name: "Output Windows", exact: true }).click();
  const player = page.getByRole("tab", { name: /^Player Filters/ });
  const admin = page.getByRole("tab", { name: /^GM Filters/ });
  const custom = page.getByRole("tab", { name: /^Custom Filters/ });
  await expect(player).toHaveAttribute("aria-selected", "true");
  await expect(player).toHaveText("Player Filters [0/13]");
  await expect(page.getByLabel("Grid Output", { exact: true })).toBeVisible();
  await expect(page.getByLabel("SIC", { exact: true })).toBeVisible();
  await expect(page.getByLabel("XHELP", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Television", { exact: true })).toBeVisible();
  const coder = page.getByRole("tab", { name: /^Coder Filters/ });
  await expect(coder).toHaveText("Coder Filters [0/6]");
  await page.getByLabel("OOC Chat", { exact: true }).check();
  await admin.click();
  await page.getByLabel("Puppet [All]", { exact: true }).check();
  await expect(player).toHaveText("Player Filters [1/13]");
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

test("empty secondary uses its configured theme on load and shows pause state before its first match", async ({ page }) => {
  await page.evaluate(() => window.outputTest.manager.updateSettings({ open: true, selected: ["ooc-chat"] }));
  const secondary = page.locator("#secondaryBuffer");
  const help = page.locator("#output-secondary-help");
  await expect(secondary).toBeVisible();
  await expect(help).toContainText("Waiting for matching output.");
  await expect(secondary).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(page.locator("#output-secondary-panel header")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  for (const theme of ["snow", "slither", "corpie", "normal"]) {
    await page.evaluate((theme) => {
      window.outputTest.client.setClientOption("colorSet", theme);
      window.outputTest.client.setClientOption("secondaryColorSet", theme);
    }, theme);
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

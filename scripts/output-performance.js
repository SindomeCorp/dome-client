/* global window, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { JSDOM } from "jsdom";
import logger from "../src/logger.js";

const argument = (name, fallback) => process.argv.find((arg) => arg.startsWith("--" + name + "="))?.split("=").slice(1).join("=") || fallback;
const sizes = argument("sizes", "20000,100000,1000000").split(",").map(Number);
if (sizes.some((size) => !Number.isSafeInteger(size) || size < 1)) throw new Error("Sizes must be positive integers.");
const output = argument("output", "/tmp/dome-output-performance.json");
const logPath = argument("log", "");
const baseUrl = "http://127.0.0.1:4319";
const server = spawn(process.execPath, ["test-support/output-browser-server.js", "4319"], { stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", (data) => logger.debug(data.toString().trim()));
server.stderr.on("data", (data) => logger.debug(data.toString().trim()));
let browser;

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode != null) throw new Error("Browser fixture server exited before startup.");
    try { if ((await fetch(baseUrl)).ok) return; } catch { /* Server is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out starting browser fixture server.");
}

async function metrics(page, cdp) {
  await page.evaluate(() => { window.outputPhase = "measurement"; });
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = await cdp.send("Runtime.getHeapUsage");
  const dom = await cdp.send("Memory.getDOMCounters");
  const rows = await page.locator("[data-output-id]").count();
  return { heapBytes: heap.usedSize, domNodes: dom.nodes, mountedRows: rows };
}

async function runReplay(size, fixture) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.route("https://**/*", (route) => route.abort());
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.outputTest);
  const cdp = await context.newCDPSession(page);
  const baseline = await metrics(page, cdp);
  await page.evaluate(() => {
    window.outputTest.manager.updateSettings({ open: true, selected: window.__OUTPUT_WINDOWS__.presets.map((rule) => rule.id) });
    window.outputLongTasks = [];
    window.outputPhase = "receive";
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.outputLongTasks.push({ phase: window.outputPhase, durationMs: entry.duration });
    }).observe({ entryTypes: ["longtask"] });
    window.outputWorstHeartbeatMs = 0;
    let last = performance.now();
    window.outputHeartbeat = setInterval(() => {
      const now = performance.now();
      window.outputWorstHeartbeatMs = Math.max(window.outputWorstHeartbeatMs, now - last);
      last = now;
    }, 16);
  });
  const receivedAt = performance.now();
  if (fixture) {
    for (let offset = 0; offset < fixture.length; offset += 128) {
      await page.evaluate(async (rows) => {
        const { manager } = window.outputTest;
        manager.inputQueue.task(() => {
          let runs = [];
          let group = rows[0]?.group;
          const flush = () => {
            if (group) manager.startBlock();
            else manager.endBlock();
            manager.appendRuns(runs);
            runs = [];
          };
          for (const row of rows) {
            if (row.group !== group) { flush(); group = row.group; }
            runs.push(...row.runs, { text: "\n", classes: [], inlineStyles: [] });
          }
          flush();
        });
        await manager.idle();
      }, fixture.slice(offset, offset + 128));
    }
  } else {
    await page.evaluate(async (count) => {
      for (let start = 0; start < count; start += 5000) {
        const lines = [];
        for (let i = start; i < Math.min(count, start + 5000); i++) {
          const prefix = i % 10 < 7 ? "[-][Team-Chat] " : "Room output: ";
          let text = prefix + "history message " + i + " A synthetic line of game output.";
          if (i === 1234) text += " SCROLLBACK_PERF_NEEDLE";
          if (i % 37 === 0) text += " Longer wrapped output.".repeat(10);
          if (i % 997 === 0) text += " https://example.invalid/preview.png";
          if (i % 17 === 0) text = "\u001b[31m" + text + "\u001b[0m";
          if (i % 5000 === 10) text = "#$# SDWC-START-NOWRAP\n" + text;
          if (i % 5000 === 35) text += "\n#$# SDWC-END-NOWRAP";
          lines.push(text);
        }
        window.outputTest.client.parseSocketData(lines.join("\n") + "\n");
        await window.outputTest.manager.idle();
      }
    }, size);
  }
  const receiveMs = performance.now() - receivedAt;
  await page.waitForTimeout(100);
  const open = await metrics(page, cdp);
  const operations = await page.evaluate(async () => {
    const { manager, searchSnapshot, exportSnapshot, client } = window.outputTest;
    const measure = async (phase, action) => {
      window.outputPhase = phase;
      const start = performance.now();
      const value = await action();
      return { elapsedMs: performance.now() - start, value };
    };
    const jump = await measure("jump", async () => {
      const view = manager.views.main;
      view.jump(view.index.at(Math.floor(view.index.length / 2))?.id);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return view.mounted.size;
    });
    const find = await measure("find", async () => (await searchSnapshot(await manager.snapshot(), "SCROLLBACK_PERF_NEEDLE")).length);
    const resize = await measure("resize", async () => {
      manager.updateSettings({ secondarySize: 45 });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return manager.views.main.mounted.size + manager.views.secondary.mounted.size;
    });
    const close = await measure("close", async () => {
      manager.updateSettings({ open: false });
      await manager.whenIndexed();
      return manager.views.main.index.length;
    });
    const exportLog = await measure("export", async () => {
      const parts = await exportSnapshot(await manager.snapshot(), { client });
      return parts.reduce((sum, part) => sum + part.length, 0);
    });
    const input = await measure("input", async () => {
      client.inputReader.value = "look";
      client.inputReader.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return client.inputReader.value;
    });
    return { jump, find, resize, close, exportLog, input };
  });
  const closed = await metrics(page, cdp);
  const observations = await page.evaluate(() => {
    clearInterval(window.outputHeartbeat);
    return { longTasks: window.outputLongTasks, worstHeartbeatMs: window.outputWorstHeartbeatMs, retainedLines: window.outputTest.manager.history.length };
  });
  await page.evaluate(() => window.outputTest.manager.clear());
  await page.waitForTimeout(50);
  const cleared = await metrics(page, cdp);
  if (observations.retainedLines !== size) throw new Error("Replay lost output: expected " + size + ", got " + observations.retainedLines);
  if (open.mountedRows > 1000 || closed.mountedRows > 1000) throw new Error("Mounted rows grew beyond the viewport budget.");
  const result = { size, fixture: Boolean(fixture), receiveMs, baseline, open, closed, cleared, operations, ...observations };
  logger.info("Output replay complete", { size, receiveMs: Math.round(receiveMs), mountedRows: open.mountedRows, heapMiB: Math.round(open.heapBytes / 1024 / 1024), longTasks: observations.longTasks.length });
  await context.close();
  return result;
}

async function readFixture(filePath) {
  const dom = new JSDOM(await readFile(filePath, "utf8"));
  const buffer = dom.window.document.querySelector("#lineBuffer");
  if (!buffer) throw new Error("Log has no output buffer.");
  const groups = new Map();
  const rows = [...buffer.querySelectorAll("div")].filter((row) => !row.classList.contains("sdwc-nowrap-block")).map((row) => {
    const block = row.closest(".sdwc-nowrap-block");
    if (block && !groups.has(block)) groups.set(block, groups.size + 1);
    const walker = dom.window.document.createTreeWalker(row, 4);
    const runs = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const classes = [];
      const inlineStyles = [];
      for (let parent = node.parentElement; parent && parent !== row; parent = parent.parentElement) {
        classes.push(...parent.classList);
        if (parent.getAttribute("style")) inlineStyles.push(parent.getAttribute("style"));
      }
      runs.push({ text: node.data, classes, inlineStyles });
    }
    return { runs, group: groups.get(block) || null };
  });
  dom.window.close();
  return rows;
}

try {
  await waitForServer();
  browser = await chromium.launch();
  const results = [];
  for (const size of sizes) results.push(await runReplay(size));
  if (logPath) {
    const fixture = await readFixture(logPath);
    results.push(await runReplay(fixture.length, fixture));
  }
  const report = {
    recordedAt: new Date().toISOString(), node: process.version, browser: browser.version(),
    machine: { platform: platform(), release: release(), cpu: cpus()[0].model, cpuCount: cpus().length, memoryGiB: totalmem() / 1024 ** 3 },
    results
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  logger.info("Output performance report written to " + output);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

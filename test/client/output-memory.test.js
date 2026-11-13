import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("bounded history releases the backing string of a huge received burst", () => {
  const source = [
    "import { createInputQueue } from \"./src/client/features/output-windows/work-queue.js\";",
    "import { createAnsiRenderer } from \"./src/client/features/terminal/ansi-renderer.js\";",
    "import { OutputHistory, splitRunsIntoLines } from \"./src/client/features/output-windows/history.js\";",
    "const queue = createInputQueue();",
    "const history = new OutputHistory();",
    "const ansi = createAnsiRenderer();",
    "global.gc();",
    "const baseline = process.memoryUsage().heapUsed;",
    "let burst = Array.from({length:500000}, (_,i) => \"A representative incoming line of game output \"+i+\" with a little extra text.\\n\").join(\"\");",
    "queue.text(burst, part => {",
    "  for (const runs of splitRunsIntoLines(ansi.renderRuns(part))) history.append(runs);",
    "  history.prune(1000);",
    "});",
    "burst = null;",
    "await queue.idle();",
    "global.gc();",
    "const retained = process.memoryUsage().heapUsed - baseline;",
    // Without copying input chunks, 1,000 remaining records pin the 38 MiB
    // original burst. Leave ample headroom for engine and coverage differences.
    "if (history.length !== 1000 || retained > 8 * 1024 * 1024) process.exitCode = 1;"
  ].join("\n");
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--expose-gc", "--input-type=module", "-e", source], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: "pipe"
  }));
});

test("unresolved routing promises release records removed by the history limit", () => {
  const source = [
    "import { createOutputApp } from \"./test-support/output-app.js\";",
    "const { manager, client, win } = await createOutputApp(undefined, { workerFactory: () => ({",
    "  addEventListener() {}, postMessage() {}, terminate() {}",
    "}) });",
    "client.preferences.performanceBuffer = 10;",
    "manager.updateSettings({ open: true, selected: [\"team-chat\"] });",
    "let first;",
    "const append = manager.history.append.bind(manager.history);",
    "manager.history.append = (...args) => { const record = append(...args); first ||= new WeakRef(record); return record; };",
    "client.parseSocketData(Array.from({length:50000}, (_,i) => \"[-][Team-Chat] queued \"+i+\"\\n\").join(\"\"));",
    "await manager.inputQueue.idle();",
    "await new Promise(resolve => setTimeout(resolve, 0));",
    "global.gc();",
    "if (manager.history.length !== 10 || manager.pending.size > 2 || first.deref()) process.exitCode = 1;",
    "manager.destroy(); win.close();"
  ].join("\n");
  assert.doesNotThrow(() => execFileSync(process.execPath, [
    "--expose-gc", "--experimental-test-module-mocks", "--import=./test/mock-module.js", "--input-type=module", "-e", source
  ], { cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: "pipe" }));
});

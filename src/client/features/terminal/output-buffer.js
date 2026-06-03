import { logger } from "../../core/constants.js";
import { createSocketOutputEventHandler } from "./socket-output-effects.js";
import { createSocketOutputProtocolParser } from "./socket-output-protocol.js";
import { createSocketOutputRenderer } from "./socket-output-renderer.js";

export function setupOutputParser({
  client,
  logger: log = logger,
  win = globalThis.window
} = {}) {
  const nowMs = () =>
    (win.performance && win.performance.now) ? win.performance.now() : Date.now();

  const protocolParser = createSocketOutputProtocolParser();
  const renderer = createSocketOutputRenderer({ client, logger: log, nowMs });
  const handleProtocolEvent = createSocketOutputEventHandler({ client, logger: log, renderer });
  client.activeEditor = protocolParser.editorState;
  client.resetSdwcNowrapState = renderer.resetSdwcNowrapState;
  client.resetAnsiRendererState = renderer.resetAnsiRendererState;

  client.parseSocketData = function (incomingSegmentRaw) {
    const startTime = nowMs();
    let kidCount = client.buffer.childNodes.length;

    const events = protocolParser.parse(incomingSegmentRaw);
    for (const event of events) {
      kidCount = handleProtocolEvent(event);
    }
    client.activeEditor = protocolParser.editorState;

    const WARN_THRESHOLD = 10; // ms
    const execDuration = nowMs() - startTime;

    if (execDuration > WARN_THRESHOLD) {
      log.warn(
        "slow buffer append: " +
          "nodes=" + kidCount +
          ", segmentLength=" + String(incomingSegmentRaw ?? "").length +
          ", durationMs=" + execDuration.toFixed(2) +
          ", thresholdMs=" + WARN_THRESHOLD
      );
    }

    renderer.pruneBuffer();
    client.scrollBuffer();
  };
}

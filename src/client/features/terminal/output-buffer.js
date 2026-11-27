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
  let connectionGeneration = 0;
  client.resetOutputProtocol = () => {
    protocolParser.reset();
    client.activeEditor = protocolParser.editorState;
  };
  client.resetOutputStream = () => {
    connectionGeneration++;
    const reset = () => {
      client.resetOutputProtocol();
      renderer.resetSdwcNowrapState();
      renderer.resetAnsiRendererState();
    };
    if (client.outputWindows) client.outputWindows.inputQueue.task(reset);
    else reset();
  };

  const parseSegment = function (incomingSegmentRaw) {
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
  client.parseSocketData = (incomingSegmentRaw) => {
    if (!client.outputWindows) return parseSegment(incomingSegmentRaw);
    const windows = client.outputWindows;
    const connection = connectionGeneration;
    windows.inputQueue.text(String(incomingSegmentRaw ?? ""), (part, context) => {
      if (connection !== connectionGeneration) return;
      windows.withContext(context, () => parseSegment(part));
    }, windows.routeState());
  };
}

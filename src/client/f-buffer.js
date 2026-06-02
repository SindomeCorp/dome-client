import { dome, logger } from "./b-variables.js";
import { createSocketOutputEventHandler } from "./socket-output-effects.js";
import { createSocketOutputProtocolParser } from "./socket-output-protocol.js";
import { createSocketOutputRenderer } from "./socket-output-renderer.js";

dome.setupOutputParser = function () {
  const nowMs = () =>
    (window.performance && window.performance.now) ? window.performance.now() : Date.now();

  const protocolParser = createSocketOutputProtocolParser();
  const renderer = createSocketOutputRenderer({ dome, logger, nowMs });
  const handleProtocolEvent = createSocketOutputEventHandler({ dome, logger, renderer });
  dome.activeEditor = protocolParser.editorState;
  dome.resetSdwcNowrapState = renderer.resetSdwcNowrapState;
  dome.resetAnsiRendererState = renderer.resetAnsiRendererState;

  dome.parseSocketData = function (incomingSegmentRaw) {
    const startTime = nowMs();
    let kidCount = dome.buffer.childNodes.length;

    const events = protocolParser.parse(incomingSegmentRaw);
    for (const event of events) {
      kidCount = handleProtocolEvent(event);
    }
    dome.activeEditor = protocolParser.editorState;

    const WARN_THRESHOLD = 10; // ms
    const execDuration = nowMs() - startTime;

    if (execDuration > WARN_THRESHOLD) {
      logger.warn(
        "slow buffer append: " +
          "nodes=" + kidCount +
          ", segmentLength=" + String(incomingSegmentRaw ?? "").length +
          ", durationMs=" + execDuration.toFixed(2) +
          ", thresholdMs=" + WARN_THRESHOLD
      );
    }

    renderer.pruneBuffer();
    dome.scrollBuffer();
  };
};

export function normalizeSocketNewlines(value) {
  return (value ?? "").replace(/\r\n?/g, "\n");
}

export function findDotTerminator(text, fromIndex = 0) {
  if (!text) return null;
  const start = Math.max(0, fromIndex);
  const leadingIdx = text.indexOf(".\n", start);
  if (leadingIdx === start) {
    return { index: leadingIdx, length: 2, hasLeadingNewline: false };
  }
  const middleIdx = text.indexOf("\n.\n", start);
  if (middleIdx > -1) {
    return { index: middleIdx + 1, length: 2, hasLeadingNewline: true };
  }
  return null;
}

function createEditorState() {
  return {
    readingContent: false,
    buffer: "",
    editorName: "",
    uploadCommand: ""
  };
}

function findMetaIndex(segment) {
  return segment.indexOf("#$#") === 0 ? 0 : segment.indexOf("\n#$#");
}

function parseMetaLine(metaLine) {
  let parts = metaLine.split(" upload: ");
  const uploadCommand = parts[parts.length - 1];
  parts = parts[0].split(" name: ");
  const editorName = parts[parts.length - 1];

  return {
    metaCommand: parts[0].slice(4),
    editorName,
    uploadCommand
  };
}

function parseJsonPayload(command, payloadRaw) {
  try {
    return { event: { type: command, payload: JSON.parse(payloadRaw) } };
  } catch (error) {
    return { event: { type: "sdwc-parse-error", command, error } };
  }
}

function parseOverlayPayload(command, payloadRaw) {
  let payload = null;
  if (payloadRaw) {
    try {
      payload = JSON.parse(payloadRaw);
    } catch (error) {
      return { event: { type: "sdwc-parse-error", command, error } };
    }
  }

  if (command === "sdwc-verb-overlay") {
    return {
      event: {
        type: "sdwc-verb-overlay",
        objectId: String(payload?.object || "").trim(),
        verbName: String(payload?.verb || "").trim(),
        payload
      }
    };
  }

  return {
    event: {
      type: "sdwc-prop-overlay",
      objectId: String(payload?.object || "").trim(),
      propertyName: String(payload?.property || "").trim(),
      payload
    }
  };
}

function parseSdwcMetaCommand(metaCommand) {
  const metaCommandNormalized = metaCommand.trim().toUpperCase();
  if (metaCommandNormalized === "SDWC-START-NOWRAP") {
    return { event: { type: "sdwc-nowrap-start" }, isNowrapMarker: true };
  }
  if (metaCommandNormalized === "SDWC-END-NOWRAP") {
    return { event: { type: "sdwc-nowrap-end" }, isNowrapMarker: true };
  }

  const sdwcParts = metaCommand.trim().split("%%");
  if ((sdwcParts[0] || "").toUpperCase() !== "SDWC") {
    return { event: { type: "sdwc-unknown", command: metaCommand } };
  }

  const sdwcCommand = (sdwcParts[1] || "").trim().toLowerCase();
  const sdwcPayload = sdwcParts.slice(2).join("%%").trim();
  if (sdwcCommand === "verbs" && sdwcPayload) {
    return parseJsonPayload("sdwc-verbs", sdwcPayload);
  }
  if (sdwcCommand === "props" && sdwcPayload) {
    return parseJsonPayload("sdwc-props", sdwcPayload);
  }
  if (sdwcCommand === "verb-overlay") {
    return parseOverlayPayload("sdwc-verb-overlay", sdwcPayload);
  }
  if (sdwcCommand === "prop-overlay") {
    return parseOverlayPayload("sdwc-prop-overlay", sdwcPayload);
  }

  return { event: { type: "sdwc-unknown", command: metaCommand } };
}

export function createSocketOutputProtocolParser() {
  let carry = "";
  let editor = createEditorState();

  const resetEditor = () => {
    editor = createEditorState();
  };

  const parser = {
    get editorState() {
      return editor;
    },

    resetEditor,

    parse(incomingSegmentRaw) {
      const events = [];
      let segment = normalizeSocketNewlines(incomingSegmentRaw);

      if (carry) {
        segment = carry + segment;
        carry = "";
      }

      const lastNewline = segment.lastIndexOf("\n");
      if (lastNewline === -1) {
        carry = segment;
        return events;
      }

      const complete = segment.slice(0, lastNewline + 1);
      carry = segment.slice(lastNewline + 1);
      segment = complete;

      if (editor.readingContent) {
        const terminator = findDotTerminator(segment);
        if (terminator) {
          if (terminator.hasLeadingNewline) {
            editor.buffer += segment.slice(0, terminator.index - 1);
          } else {
            editor.buffer += segment.slice(0, terminator.index);
          }
          events.push({ type: "editor-content", editor: { ...editor } });
          resetEditor();
          segment = segment.slice(terminator.index + terminator.length);
          events.push({ type: "fade", message: "BUFFERING POPUP ..." });
        } else {
          editor.buffer += segment;
          events.push({ type: "fade", message: "<span class=\"warn\">BUFFERING POPUP ...</span>" });
          return events;
        }
      }

      let metaIdx;
      while ((metaIdx = findMetaIndex(segment)) > -1) {
        const start = metaIdx === 0 ? 0 : metaIdx + 1;
        const end = segment.indexOf("\n", start);
        const lineEnd = end === -1 ? segment.length : end;
        const metaLine = segment.slice(start, lineEnd);
        const { metaCommand, editorName, uploadCommand } = parseMetaLine(metaLine);

        if (metaCommand === "edit") {
          const termPos = findDotTerminator(segment, lineEnd + 1);
          if (termPos) {
            const bufferEnd = termPos.hasLeadingNewline ? termPos.index - 1 : termPos.index;
            events.push({
              type: "editor-content",
              updateEditorList: true,
              editor: {
                editorName,
                uploadCommand,
                buffer: segment.slice(lineEnd + 1, bufferEnd)
              }
            });
            segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) +
              segment.slice(termPos.index + termPos.length);
          } else {
            editor.readingContent = true;
            editor.buffer += segment.slice(lineEnd + 1);
            editor.editorName = editorName;
            editor.uploadCommand = uploadCommand;
            segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx);
          }
        } else if (metaCommand && metaCommand.indexOf("user") === 0) {
          const typeStart = metaLine.indexOf("user-type");
          if (typeStart > -1) {
            const userType = metaLine.slice(typeStart).split(/\s+/)[1] || "";
            events.push({
              type: "user-type",
              userType
            });
          }
          segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);
        } else if (metaCommand === "- PING!") {
          segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);
          events.push({ type: "ping" });
        } else if (/^\s*SDWC\b/i.test(metaCommand)) {
          const parsed = parseSdwcMetaCommand(metaCommand);
          if (parsed.isNowrapMarker) {
            const beforeMarker = segment.slice(0, metaIdx === 0 ? 0 : metaIdx + 1);
            if (beforeMarker) {
              events.push({ type: "text", text: beforeMarker });
            }
            events.push(parsed.event);
            segment = segment.slice(lineEnd + 1);
            continue;
          }
          events.push(parsed.event);
          segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);
        } else {
          events.push({ type: "fade", message: metaCommand });
          segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);
        }
      }

      if (segment) {
        events.push({ type: "text", text: segment });
      }

      return events;
    }
  };

  return parser;
}

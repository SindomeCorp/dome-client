import { dome, logger, subs } from "./b-variables.js";
import * as replacements from "./e-replacements.js";

dome.setupOutputParser = function () {
  // ------------------------------
  // Helpers
  // ------------------------------
  const nowMs = () =>
    (window.performance && window.performance.now) ? window.performance.now() : Date.now();

  const normalizeNewlines = (s) => (s ?? "").replace(/\r\n?/g, "\n");

  const withFadeText = (msg) => {
    if (dome.setFadeText && dome.statusDisplay) dome.setFadeText(dome.statusDisplay, msg);
  };

  const uniqueId = () =>
    "i" + Math.floor(nowMs()) + "x" + Math.floor((Math.random() * 1_000_000) + 1);

  const linkifyUrlsWithPreview = (segment) => {
    return segment.replace(replacements.urlRegex, function (raw) {
      let url = raw;
      if (url.indexOf("http") !== 0) url = "http://" + url;

      const lower = url.toLowerCase();
      const isImage = lower.match(dome.urlPatterns.images);
      const isVideo = lower.match(dome.urlPatterns.videos);
      const ytId = dome.parseYouTubeID(url);

      let out = `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;

      if (isImage || isVideo || ytId) {
        const id = uniqueId();
        const chevron = dome.preferences.imagePreview ? "down" : "up";
        out += `<i id="b${id}" class="icon-white icon-chevron-${chevron}" aria-hidden="true" style="cursor:pointer" data-image-id="${id}" data-image-url="${url}"></i>`;
        out += `<span id="s${id}">`;
        if (dome.preferences.imagePreview) {
          out += `<br><a href="${url}" target="_blank" rel="noopener noreferrer">`;
          if (isVideo) {
            out += `<video class="shown-image" loop muted autoplay id="${id}" style="max-width:75%"><source type="video/mp4" src="${url.replace(/gifv$/, "mp4")}"></video>`;
          } else if (ytId) {
            const width = Math.min(dome.buffer.clientWidth - 20, 560);
            const height = Math.floor(width * 0.5652);
            out += `<iframe id="${id}" class="shown-image" width="${width}" height="${height}" src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen></iframe>`;
          } else {
            out += `<img class="shown-image" id="${id}" src="${url}" style="max-width:75%">`;
          }
          out += "</a><br>";
        }
        out += "</span>";
      }
      return out;
    });
  };

  const linkifyHosts = (segment) => {
    const resetRegex = (rx) => { if (rx) rx.lastIndex = 0; };
    return segment.replace(/\[host=([^\]]+)\]/gi, (_full, host) => {
      resetRegex(replacements.ipRegex);
      if (replacements.ipRegex && replacements.ipRegex.test(host)) {
        return `<a href="https://whatismyipaddress.com/ip/${host}" target="_new" rel="noopener noreferrer">${host}</a>`;
      }
      resetRegex(replacements.hostnameRegex);
      if (replacements.hostnameRegex && replacements.hostnameRegex.test(host)) {
        return `<a href="https://whatismyipaddress.com/hostname-ip?DOMAINNAME=${host}" target="_new" rel="noopener noreferrer">${host}</a>`;
      }
      return host;
    });
  };

  const findDotTerminator = (text, fromIndex = 0) => {
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
  };

  const wrapLinesToDivs = (text) => {
    // text ends with '\n' by construction (see carry guard)
    const parts = text.split("\n");
    let html = parts.map((line) => {
      if (line === "") return "<div><br></div>";
      const stripped = line.replace(/<\/?span[^>]*>/g, "").trim();
      return stripped ? `<div>${line}</div>` : "<div><br></div>";
    }).join("");
    // remove the trailing <div><br></div> caused by the final newline
    html = html.replace(/<div><br><\/div>$/, "");
    return html;
  };

  // ------------------------------
  // Editor state (multi-event buffering)
  // ------------------------------
  let editor;
  const editorInit = () => {
    dome.activeEditor = editor = {
      readingContent: false,
      buffer: "",
      editorName: "",
      uploadCommand: ""
    };
  };
  editorInit();

  // ------------------------------
  // Carry buffer for trailing partial line
  // ------------------------------
  let _carry = "";
  let sdwcNowrapActive = false;
  let activeSdwcNowrapBlock = null;

  const createSdwcNowrapBlock = () => {
    if (!dome.buffer || typeof document === "undefined") {
      return null;
    }
    const block = document.createElement("div");
    block.className = "sdwc-nowrap-block";
    dome.buffer.append(block);
    return block;
  };

  const resetSdwcNowrapState = () => {
    sdwcNowrapActive = false;
    activeSdwcNowrapBlock = null;
  };

  dome.resetSdwcNowrapState = resetSdwcNowrapState;

  // ------------------------------
  // Main parser
  // ------------------------------
  dome.parseSocketData = function (incomingSegmentRaw) {
    const startTime = nowMs();

    // 1) Normalize newlines immediately
    let segment = normalizeNewlines(incomingSegmentRaw);

    // 2) EARLY carry guard — ensure we only process complete lines now
    if (_carry) {
      segment = _carry + segment;
      _carry = "";
    }
    const lastNL = segment.lastIndexOf("\n");
    if (lastNL === -1) {
      _carry = segment; // nothing complete yet
      return;
    }
    // Process only up to the last newline; keep the tail for next event
    const complete = segment.slice(0, lastNL + 1); // includes '\n'
    _carry = segment.slice(lastNL + 1);            // tail without '\n'
    segment = complete;

    // ------------------ Editor mode handling ------------------
    if (editor.readingContent) {
      // Look for terminator: line with a single dot
      const terminator = findDotTerminator(segment);
      if (terminator) {
        if (terminator.hasLeadingNewline) {
          editor.buffer += segment.slice(0, terminator.index - 1);
        } else {
          editor.buffer += segment.slice(0, terminator.index);
        }
        const spawned = dome.makeEditor(editor);
        if (spawned) {
          dome.spawned[editor.editorName] = spawned;
          dome.updateEditorListView();
        }
        editorInit();
        segment = segment.slice(terminator.index + terminator.length);
      } else {
        // keep buffering all complete lines; wait for terminator in a later event
        editor.buffer += segment;
        withFadeText("<span class=\"warn\">BUFFERING POPUP ...</span>");
        return;
      }
      withFadeText("BUFFERING POPUP ...");
    }

    // ------------------ Meta command handling (#$# ...) ------------------
    let metaIdx;
    while ((metaIdx = (segment.indexOf("#$#") === 0 ? 0 : segment.indexOf("\n#$#"))) > -1) {
      const start = metaIdx === 0 ? 0 : metaIdx + 1; // skip leading \n if present
      const end = segment.indexOf("\n", start);
      const lineEnd = end === -1 ? segment.length : end;
      let metaLine = segment.slice(start, lineEnd); // '#$# ...'

      // parse fields
      let a = metaLine.split(" upload: ");
      const uploadCommand = a[a.length - 1];
      a = a[0].split(" name: ");
      const editorName = a[a.length - 1];

      // remove '#$# ' prefix (always 4 chars)
      const metaCommand = a[0].slice(4);
      if (!/^\s*SDWC\b/i.test(metaCommand)) {
        logger.debug(editorName);
      }

      if (metaCommand === "edit") {
        editorInit();
        // find editor terminator in the current segment
        const termPos = findDotTerminator(segment, lineEnd + 1);
        if (termPos) {
          const bufferEnd = termPos.hasLeadingNewline ? termPos.index - 1 : termPos.index;
          dome.spawned[editorName] = dome.makeEditor({
            editorName,
            uploadCommand,
            buffer: segment.slice(lineEnd + 1, bufferEnd)
          });
          dome.updateEditorListView();
          // remove the whole edit block including terminator
          segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(termPos.index + termPos.length);
        } else {
          // begin buffering across events
          editor.readingContent = true;
          editor.buffer += segment.slice(lineEnd + 1);
          editor.editorName = editorName;
          editor.uploadCommand = uploadCommand;
          // remove everything from the meta line forward
          segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx);
        }
      } else if (metaCommand && metaCommand.indexOf("user") === 0) {
        // Extract user type (e.g., "staff", "player")
        const typeStart = metaLine.indexOf("user-type");
        if (typeStart > -1) {
          dome.userType = metaLine.slice(typeStart, typeStart + 12).split(" ")[1];
        }
        // Remove meta line from the segment
        segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);

        // Reinit autocomplete with user-type aware list
        if (dome.setupAutoComplete && dome.inputReader) {
          dome.setupAutoComplete(dome.inputReader, dome.userType);
        }
      } else if (metaCommand === "- PING!") {
        // Strip out ping line
        segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);
        withFadeText("pinged");
      } else if (/^\s*SDWC\b/i.test(metaCommand)) {
        const metaCommandNormalized = metaCommand.trim().toUpperCase();
        if (metaCommandNormalized === "SDWC-START-NOWRAP") {
          if (!dome.preferences?.sdwcNowrapBlocks) {
            segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);
            continue;
          }
          if (sdwcNowrapActive) {
            logger.warn("Received duplicate SDWC-START-NOWRAP while nowrap mode is active");
          } else {
            activeSdwcNowrapBlock = createSdwcNowrapBlock();
            sdwcNowrapActive = Boolean(activeSdwcNowrapBlock);
          }
          segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);
          continue;
        } else if (metaCommandNormalized === "SDWC-END-NOWRAP") {
          if (sdwcNowrapActive) {
            resetSdwcNowrapState();
          } else {
            logger.warn("Received SDWC-END-NOWRAP without an active nowrap block");
          }
          segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);
          continue;
        }
        const sdwcParts = metaCommand.trim().split("%%");
        if ((sdwcParts[0] || "").toUpperCase() === "SDWC") {
          const sdwcCommand = (sdwcParts[1] || "").trim().toLowerCase();
          const sdwcPayload = sdwcParts.slice(2).join("%%").trim();
          if (sdwcCommand === "verbs" && sdwcPayload) {
            try {
              const parsed = JSON.parse(sdwcPayload);
              if (dome.ideWindow && !dome.ideWindow.closed) {
                dome.ideWindow.postMessage({ type: "ide-object-verbs", payload: parsed }, "*");
              }
            } catch (err) {
              logger.warn("Failed to parse SDWC VERBS payload", err);
            }
          } else if (sdwcCommand === "verb-overlay") {
            const overlayPayloadRaw = sdwcParts.slice(2).join("%%").trim();
            let overlayPayload = null;
            if (overlayPayloadRaw) {
              try {
                overlayPayload = JSON.parse(overlayPayloadRaw);
              } catch (err) {
                logger.warn("Failed to parse SDWC VERB-OVERLAY payload", err);
              }
            }
            const overlayObject = String(overlayPayload?.object || "").trim();
            const overlayVerb = String(overlayPayload?.verb || "").trim();
            if (overlayObject && overlayVerb && dome.ideWindow && !dome.ideWindow.closed) {
              console.log("[SDWC overlay parsed][verb]", {
                objectId: overlayObject,
                verbName: overlayVerb,
                payload: overlayPayload
              });
              dome.ideWindow.postMessage({
                type: "ide-verb-overlay",
                objectId: overlayObject,
                verbName: overlayVerb,
                payload: overlayPayload
              }, "*");
            } else {
              console.log("[SDWC overlay parsed ignored][verb]", {
                hasObject: Boolean(overlayObject),
                hasVerb: Boolean(overlayVerb),
                hasIdeWindow: Boolean(dome.ideWindow && !dome.ideWindow.closed),
                payload: overlayPayload
              });
            }
          } else if (sdwcCommand === "props" && sdwcPayload) {
            try {
              const parsed = JSON.parse(sdwcPayload);
              if (dome.ideWindow && !dome.ideWindow.closed) {
                dome.ideWindow.postMessage({ type: "ide-object-props", payload: parsed }, "*");
              }
            } catch (err) {
              logger.warn("Failed to parse SDWC PROPS payload", err);
            }
          } else if (sdwcCommand === "prop-overlay") {
            const overlayPayloadRaw = sdwcParts.slice(2).join("%%").trim();
            let overlayPayload = null;
            if (overlayPayloadRaw) {
              try {
                overlayPayload = JSON.parse(overlayPayloadRaw);
              } catch (err) {
                logger.warn("Failed to parse SDWC PROP-OVERLAY payload", err);
              }
            }
            const overlayObject = String(overlayPayload?.object || "").trim();
            const overlayProp = String(overlayPayload?.property || "").trim();
            if (overlayObject && overlayProp && dome.ideWindow && !dome.ideWindow.closed) {
              console.log("[SDWC overlay parsed][prop]", {
                objectId: overlayObject,
                propertyName: overlayProp,
                payload: overlayPayload
              });
              dome.ideWindow.postMessage({
                type: "ide-prop-overlay",
                objectId: overlayObject,
                propertyName: overlayProp,
                payload: overlayPayload
              }, "*");
            } else {
              console.log("[SDWC overlay parsed ignored][prop]", {
                hasObject: Boolean(overlayObject),
                hasProperty: Boolean(overlayProp),
                hasIdeWindow: Boolean(dome.ideWindow && !dome.ideWindow.closed),
                payload: overlayPayload
              });
            }
          }
        }
        // Remove SDWC meta line from the segment
        segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);
      } else {
        // Show other meta to the user
        withFadeText(metaCommand);
        // Remove the meta line and keep processing remainder
        segment = segment.slice(0, metaIdx === 0 ? 0 : metaIdx) + segment.slice(lineEnd + 1);
      }
    }

    if (!segment) return;

    // ------------------ Substitutions, linkifying, host/ip linking ------------------
    subs.forEach((sub) => {
      segment = segment.replace(sub.pattern, sub.replacement);
    });

    segment = linkifyUrlsWithPreview(segment);
    segment = linkifyHosts(segment);

    // ------------------ Small inline transforms ------------------
    // Wrap obj# and $corified references for easy selection
    segment = segment.replace(/(\#\d+\b)/g, "<span class=\"all-copy\">$1</span>");
    segment = segment.replace(/(\$\w*)/g, "<span class=\"all-copy\">$1</span>");

    // Alerts
    if (dome.alert && dome.alert.active && dome.alert.pattern != null) {
      const pattern = dome.alert.pattern;
      let matched = false;
      if (pattern instanceof RegExp) {
        const flags = pattern.flags.includes("i") ? pattern.flags : pattern.flags + "i";
        matched = new RegExp(pattern.source, flags).test(segment);
      } else {
        matched = segment.toLowerCase().includes(String(pattern).toLowerCase());
      }
      if (matched) {
        dome.alert.tone.play();
        dome.windowAlert();
      }
    }

    // ------------------ NEWLINE HANDLING ------------------
    // IMPORTANT: Do NOT “smart-merge” across newlines; just render each line.
    const html = wrapLinesToDivs(segment);

    // Append to buffer
    if (sdwcNowrapActive && activeSdwcNowrapBlock && !dome.buffer.contains(activeSdwcNowrapBlock)) {
      resetSdwcNowrapState();
    }
    const outputTarget = sdwcNowrapActive && activeSdwcNowrapBlock
      ? activeSdwcNowrapBlock
      : dome.buffer;
    outputTarget.insertAdjacentHTML("beforeend", html);

    // ------------------ Perf logging and pruning ------------------
    const WARN_THRESHOLD = 10; // ms
    let kidCount = dome.buffer.childNodes.length;
    const execDuration = nowMs() - startTime;

    if (execDuration > WARN_THRESHOLD) {
      logger.warn(
        "slow buffer append: " +
          "nodes=" + kidCount +
          ", segmentLength=" + segment.length +
          ", durationMs=" + execDuration.toFixed(2) +
          ", thresholdMs=" + WARN_THRESHOLD
      );
    }

    if (dome.preferences.performanceBuffer > 0) {
      while (kidCount > dome.preferences.performanceBuffer) {
        const firstChild = dome.buffer.firstChild;
        if (!firstChild) break;
        firstChild.remove();
        kidCount = dome.buffer.childNodes.length;
      }
    }

    // Keep scrolled to bottom
    dome.scrollBuffer();
  };
};

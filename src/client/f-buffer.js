import { dome, logger } from "./b-variables.js";
import * as replacements from "./e-replacements.js";
import { createAnsiRenderer } from "./ansi-renderer.js";
import { createSocketOutputProtocolParser } from "./socket-output-protocol.js";

dome.setupOutputParser = function () {
  // ------------------------------
  // Helpers
  // ------------------------------
  const nowMs = () =>
    (window.performance && window.performance.now) ? window.performance.now() : Date.now();

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

  const protocolParser = createSocketOutputProtocolParser();
  dome.activeEditor = protocolParser.editorState;

  let sdwcNowrapActive = false;
  let activeSdwcNowrapBlock = null;
  const ansiRenderer = createAnsiRenderer();

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
  dome.resetAnsiRendererState = function() {
    ansiRenderer.resetState();
  };

  const handleEditorContent = (event) => {
    const editor = event.editor;
    const spawned = dome.makeEditor(editor);
    if (event.updateEditorList) {
      dome.spawned[editor.editorName] = spawned;
      dome.updateEditorListView();
    } else if (spawned) {
      dome.spawned[editor.editorName] = spawned;
      dome.updateEditorListView();
    }
  };

  const postIdeMessage = (message) => {
    if (dome.ideWindow && !dome.ideWindow.closed) {
      dome.ideWindow.postMessage(message, "*");
      return true;
    }
    return false;
  };

  const handleProtocolEvent = (event, appendOutputSegment) => {
    if (event.type === "text") {
      appendOutputSegment(event.text);
    } else if (event.type === "editor-content") {
      handleEditorContent(event);
    } else if (event.type === "fade") {
      withFadeText(event.message);
    } else if (event.type === "user-type") {
      dome.userType = event.userType;
      if (dome.setupAutoComplete && dome.inputReader) {
        dome.setupAutoComplete(dome.inputReader, dome.userType);
      }
    } else if (event.type === "ping") {
      withFadeText("pinged");
    } else if (event.type === "sdwc-nowrap-start") {
      const nowrapEnabled = dome.preferences?.sdwcNowrapBlocks === true;
      logger.info(nowrapEnabled
        ? "Received SDWC-START-NOWRAP"
        : "Received SDWC-START-NOWRAP (ignored: sdwcNowrapBlocks disabled)");
      if (!nowrapEnabled) return;
      if (sdwcNowrapActive) {
        logger.warn("Received duplicate SDWC-START-NOWRAP while nowrap mode is active");
      } else {
        activeSdwcNowrapBlock = createSdwcNowrapBlock();
        sdwcNowrapActive = Boolean(activeSdwcNowrapBlock);
      }
    } else if (event.type === "sdwc-nowrap-end") {
      const nowrapEnabled = dome.preferences?.sdwcNowrapBlocks === true;
      logger.info(nowrapEnabled
        ? "Received SDWC-END-NOWRAP"
        : "Received SDWC-END-NOWRAP (ignored: sdwcNowrapBlocks disabled)");
      if (!nowrapEnabled) return;
      if (sdwcNowrapActive) {
        resetSdwcNowrapState();
      } else {
        logger.warn("Received SDWC-END-NOWRAP without an active nowrap block");
      }
    } else if (event.type === "sdwc-verbs") {
      postIdeMessage({ type: "ide-object-verbs", payload: event.payload });
    } else if (event.type === "sdwc-props") {
      postIdeMessage({ type: "ide-object-props", payload: event.payload });
    } else if (event.type === "sdwc-verb-overlay") {
      const hasIdeWindow = Boolean(dome.ideWindow && !dome.ideWindow.closed);
      if (event.objectId && event.verbName && hasIdeWindow) {
        logger.debug("[SDWC overlay parsed][verb]", {
          objectId: event.objectId,
          verbName: event.verbName,
          payload: event.payload
        });
        postIdeMessage({
          type: "ide-verb-overlay",
          objectId: event.objectId,
          verbName: event.verbName,
          payload: event.payload
        });
      } else {
        logger.debug("[SDWC overlay parsed ignored][verb]", {
          hasObject: Boolean(event.objectId),
          hasVerb: Boolean(event.verbName),
          hasIdeWindow,
          payload: event.payload
        });
      }
    } else if (event.type === "sdwc-prop-overlay") {
      const hasIdeWindow = Boolean(dome.ideWindow && !dome.ideWindow.closed);
      if (event.objectId && event.propertyName && hasIdeWindow) {
        logger.debug("[SDWC overlay parsed][prop]", {
          objectId: event.objectId,
          propertyName: event.propertyName,
          payload: event.payload
        });
        postIdeMessage({
          type: "ide-prop-overlay",
          objectId: event.objectId,
          propertyName: event.propertyName,
          payload: event.payload
        });
      } else {
        logger.debug("[SDWC overlay parsed ignored][prop]", {
          hasObject: Boolean(event.objectId),
          hasProperty: Boolean(event.propertyName),
          hasIdeWindow,
          payload: event.payload
        });
      }
    } else if (event.type === "sdwc-parse-error") {
      logger.warn(`Failed to parse ${event.command.replace("sdwc-", "SDWC ").toUpperCase()} payload`, event.error);
    }
  };

  // ------------------------------
  // Main parser
  // ------------------------------
  dome.parseSocketData = function (incomingSegmentRaw) {
    const startTime = nowMs();
    let kidCount = dome.buffer.childNodes.length;

    const appendOutputSegment = (rawSegment) => {
      if (!rawSegment) return;
      let outputSegment = ansiRenderer.renderChunk(rawSegment);

      // ------------------ ANSI rendering, linkifying, host/ip linking ------------------
      outputSegment = linkifyUrlsWithPreview(outputSegment);
      outputSegment = linkifyHosts(outputSegment);

      // ------------------ Small inline transforms ------------------
      // Wrap obj# and $corified references for easy selection
      outputSegment = outputSegment.replace(/(\#\d+\b)/g, "<span class=\"all-copy\">$1</span>");
      outputSegment = outputSegment.replace(/(\$\w*)/g, "<span class=\"all-copy\">$1</span>");

      // Alerts
      if (dome.alert && dome.alert.active && dome.alert.pattern != null) {
        const pattern = dome.alert.pattern;
        let matched = false;
        if (pattern instanceof RegExp) {
          const flags = pattern.flags.includes("i") ? pattern.flags : pattern.flags + "i";
          matched = new RegExp(pattern.source, flags).test(outputSegment);
        } else {
          matched = outputSegment.toLowerCase().includes(String(pattern).toLowerCase());
        }
        if (matched) {
          dome.alert.tone.play();
          dome.windowAlert();
        }
      }

      // ------------------ NEWLINE HANDLING ------------------
      // IMPORTANT: Do NOT “smart-merge” across newlines; just render each line.
      const html = wrapLinesToDivs(outputSegment);

      // Append to buffer
      if (sdwcNowrapActive && activeSdwcNowrapBlock && !dome.buffer.contains(activeSdwcNowrapBlock)) {
        resetSdwcNowrapState();
      }
      const outputTarget = sdwcNowrapActive && activeSdwcNowrapBlock
        ? activeSdwcNowrapBlock
        : dome.buffer;
      outputTarget.insertAdjacentHTML("beforeend", html);
      kidCount = dome.buffer.childNodes.length;
    };

    const events = protocolParser.parse(incomingSegmentRaw);
    for (const event of events) {
      handleProtocolEvent(event, appendOutputSegment);
    }
    dome.activeEditor = protocolParser.editorState;

    // ------------------ Perf logging and pruning ------------------
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

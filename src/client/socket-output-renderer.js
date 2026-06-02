import * as replacements from "./e-replacements.js";
import { createAnsiRenderer } from "./ansi-renderer.js";

function defaultNowMs() {
  return (typeof window !== "undefined" && window.performance && window.performance.now)
    ? window.performance.now()
    : Date.now();
}

function createUniqueId(nowMs) {
  return "i" + Math.floor(nowMs()) + "x" + Math.floor((Math.random() * 1_000_000) + 1);
}

export function wrapLinesToDivs(text) {
  const parts = text.split("\n");
  let html = parts.map((line) => {
    if (line === "") return "<div><br></div>";
    const stripped = line.replace(/<\/?span[^>]*>/g, "").trim();
    return stripped ? `<div>${line}</div>` : "<div><br></div>";
  }).join("");

  return html.replace(/<div><br><\/div>$/, "");
}

export function createSocketOutputRenderer({
  dome,
  logger,
  ansiRenderer = createAnsiRenderer(),
  nowMs = defaultNowMs
}) {
  let sdwcNowrapActive = false;
  let activeSdwcNowrapBlock = null;

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
        const id = createUniqueId(nowMs);
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

  const renderOutputSegment = (rawSegment) => {
    let outputSegment = ansiRenderer.renderChunk(rawSegment);

    outputSegment = linkifyUrlsWithPreview(outputSegment);
    outputSegment = linkifyHosts(outputSegment);
    outputSegment = outputSegment.replace(/(\#\d+\b)/g, "<span class=\"all-copy\">$1</span>");
    outputSegment = outputSegment.replace(/(\$\w*)/g, "<span class=\"all-copy\">$1</span>");

    return outputSegment;
  };

  const triggerAlertIfMatched = (outputSegment) => {
    if (!dome.alert || !dome.alert.active || dome.alert.pattern == null) return;

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
  };

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

  const startSdwcNowrapBlock = () => {
    const nowrapEnabled = dome.preferences?.sdwcNowrapBlocks === true;
    logger.info(nowrapEnabled
      ? "Received SDWC-START-NOWRAP"
      : "Received SDWC-START-NOWRAP (ignored: sdwcNowrapBlocks disabled)");
    if (!nowrapEnabled) return;
    if (sdwcNowrapActive) {
      logger.warn("Received duplicate SDWC-START-NOWRAP while nowrap mode is active");
      return;
    }

    activeSdwcNowrapBlock = createSdwcNowrapBlock();
    sdwcNowrapActive = Boolean(activeSdwcNowrapBlock);
  };

  const endSdwcNowrapBlock = () => {
    const nowrapEnabled = dome.preferences?.sdwcNowrapBlocks === true;
    logger.info(nowrapEnabled
      ? "Received SDWC-END-NOWRAP"
      : "Received SDWC-END-NOWRAP (ignored: sdwcNowrapBlocks disabled)");
    if (!nowrapEnabled) return;
    if (sdwcNowrapActive) {
      resetSdwcNowrapState();
      return;
    }

    logger.warn("Received SDWC-END-NOWRAP without an active nowrap block");
  };

  const getOutputTarget = () => {
    if (sdwcNowrapActive && activeSdwcNowrapBlock && !dome.buffer.contains(activeSdwcNowrapBlock)) {
      resetSdwcNowrapState();
    }

    return sdwcNowrapActive && activeSdwcNowrapBlock
      ? activeSdwcNowrapBlock
      : dome.buffer;
  };

  const appendOutputSegment = (rawSegment) => {
    if (!rawSegment) return dome.buffer.childNodes.length;

    const outputSegment = renderOutputSegment(rawSegment);
    triggerAlertIfMatched(outputSegment);
    getOutputTarget().insertAdjacentHTML("beforeend", wrapLinesToDivs(outputSegment));

    return dome.buffer.childNodes.length;
  };

  const pruneBuffer = () => {
    let kidCount = dome.buffer.childNodes.length;
    if (dome.preferences.performanceBuffer > 0) {
      while (kidCount > dome.preferences.performanceBuffer) {
        const firstChild = dome.buffer.firstChild;
        if (!firstChild) break;
        firstChild.remove();
        kidCount = dome.buffer.childNodes.length;
      }
    }
    return kidCount;
  };

  return {
    appendOutputSegment,
    endSdwcNowrapBlock,
    pruneBuffer,
    renderOutputSegment,
    resetAnsiRendererState: () => ansiRenderer.resetState(),
    resetSdwcNowrapState,
    startSdwcNowrapBlock
  };
}

import { renderAnsiRunHtml } from "../terminal/ansi-renderer.js";
import * as replacements from "../terminal/replacements.js";
import { getPreviewMedia } from "../terminal/media-url.js";
import { buildImagePreviewHtml } from "../terminal/image-preview.js";

function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function referenceHtml(text) {
  return text.replace(/(#\d+\b|\$\w+)/g, "<span class=\"all-copy\">$1</span>");
}

// Enrich only escaped text, never generated attributes. This avoids rewriting
// object references or dollar signs inside a link's URL.
function enrichText(text, { record, state, client, width, exportMode }, counter) {
  const regex = new RegExp(replacements.urlRegex.source, replacements.urlRegex.flags);
  let result = "";
  let offset = 0;
  for (const match of text.matchAll(regex)) {
    result += referenceHtml(text.slice(offset, match.index));
    const encodedUrl = match[0];
    const url = encodedUrl.replace(/&amp;/g, "&");
    const safeUrl = escapeAttribute(url);
    const media = getPreviewMedia(url);
    const youtube = client.parseYouTubeID?.(url);
    result += "<a href=\"" + safeUrl + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + encodedUrl + "</a>";
    if (media || youtube) {
      const id = "output-" + record.id + "-" + counter.value++;
      const expanded = !exportMode && !state.collapsed && client.preferences.imagePreview;
      result += "<button type=\"button\" class=\"output-preview-toggle\" aria-label=\"Toggle media preview\" aria-expanded=\"" + Boolean(expanded)
        + "\" data-output-media=\"" + id + "\" data-output-url=\"" + safeUrl + "\">" + (expanded ? "▾" : "▸") + "</button>";
      result += "<span data-preview-for=\"" + id + "\">";
      if (expanded) result += buildImagePreviewHtml({ imageId: id, url: safeUrl, parseYouTubeID: client.parseYouTubeID, bufferWidth: width });
      result += "</span>";
    }
    offset = match.index + encodedUrl.length;
  }
  result += referenceHtml(text.slice(offset));
  return result.replace(/\[host=([^\]]+)\]/gi, (_match, host) => {
    const plain = host.replace(/&amp;/g, "&");
    replacements.ipRegex.lastIndex = 0;
    replacements.hostnameRegex.lastIndex = 0;
    const kind = replacements.ipRegex.test(plain) ? "ip" : replacements.hostnameRegex.test(plain) ? "hostname-ip?DOMAINNAME=" : "";
    if (!kind) return host;
    const separator = kind === "ip" ? "/" : "";
    return "<a href=\"https://whatismyipaddress.com/" + kind + separator + encodeURIComponent(plain)
      + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + host + "</a>";
  });
}

export function renderRecordHtml(record, { client, width = 580, state = {}, exportMode = false } = {}) {
  const counter = { value: 0 };
  let content = record.runs.map((run) => {
    const html = renderAnsiRunHtml(run);
    // Formatting wrappers are controlled by the ANSI decoder. Work on text
    // outside those wrappers so attributes never become linkified content.
    return html.split(/(<[^>]+>)/).map((part) => part.startsWith("<") ? part : enrichText(part, {
      record, state, client, width, exportMode
    }, counter)).join("");
  }).join("");
  if (!content) content = "<br>";
  return record.echo ? "<span class=\"input-echo\">" + content + "</span>" : content;
}

export function toggleRecordPreview(control, row, client, width) {
  const id = control.dataset.outputMedia;
  const slot = [...row.querySelectorAll("[data-preview-for]")].find((item) => item.dataset.previewFor === id);
  if (!slot) return;
  const expanded = control.getAttribute("aria-expanded") === "true";
  slot.innerHTML = expanded ? "" : buildImagePreviewHtml({
    imageId: id, url: escapeAttribute(control.dataset.outputUrl), parseYouTubeID: client.parseYouTubeID, bufferWidth: width
  });
  control.setAttribute("aria-expanded", String(!expanded));
  control.textContent = expanded ? "▸" : "▾";
}

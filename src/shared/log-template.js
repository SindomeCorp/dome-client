const HTML_SUFFIX = "</div></div></body></html>";
const LEGACY_LOG_STYLESHEET = "https://sindome.org/css/dome.css";

/**
 * Wraps buffer markup in the HTML shell used for downloadable logs.
 *
 * @param {string | undefined | null} bufferHtml
 * @param {string | undefined | null} styleCss
 * @param {boolean | undefined | null} inlineCss
 * @returns {string}
 */
export function buildLogHtml(bufferHtml = "", styleCss = "", inlineCss = true) {
  const safeBuffer = bufferHtml ?? "";
  const safeStyle = (styleCss ?? "").replace(/<\/style/gi, "<\\/style");
  const styleMarkup = inlineCss
    ? `<style>${safeStyle}</style>`
    : `<link rel="stylesheet" href="${LEGACY_LOG_STYLESHEET}">`;
  const htmlPrefix = [
    "<html><head><meta charset=\"utf-8\"><title>Web Client Buffer</title>",
    styleMarkup,
    "</head><body><div id=\"browser-client\"><div id=\"lineBuffer\">"
  ].join("");
  return htmlPrefix + safeBuffer + HTML_SUFFIX;
}

const HTML_SUFFIX = "</div></div></body></html>";

/**
 * Wraps buffer markup in the HTML shell used for downloadable logs.
 *
 * @param {string | undefined | null} bufferHtml
 * @param {string | undefined | null} styleCss
 * @returns {string}
 */
export function buildLogHtml(bufferHtml = "", styleCss = "") {
  const safeBuffer = bufferHtml ?? "";
  const safeStyle = (styleCss ?? "").replace(/<\/style/gi, "<\\/style");
  const htmlPrefix = [
    "<html><head><meta charset=\"utf-8\"><title>Web Client Buffer</title>",
    `<style>${safeStyle}</style>`,
    "</head><body><div id=\"browser-client\"><div id=\"lineBuffer\">"
  ].join("");
  return htmlPrefix + safeBuffer + HTML_SUFFIX;
}

const HTML_PREFIX = [
  "<html><head><title>Web Client Buffer</title>",
  "<link rel=\"stylesheet\" href=\"http://fonts.googleapis.com/css?family=Source+Code+Pro|Quantico:400,400italic,700|Roboto+Mono|Comic+Mono\">",
  "<base href=\"http://play.sindome.org\">",
  "<link rel=\"stylesheet\" type=\"text/css\" href=\"http://www.sindome.org/css/dome.css\">",
  "<link rel=\"stylesheet\" type=\"text/css\" href=\"http://play.sindome.org/css/client.css\">",
  "</head><body><div id=\"browser-client\"><div id=\"lineBuffer\">"
].join("");

const HTML_SUFFIX = "</div></div></body></html>";

/**
 * Wraps buffer markup in the HTML shell used for downloadable logs.
 *
 * @param {string | undefined | null} bufferHtml
 * @returns {string}
 */
export function buildLogHtml(bufferHtml = "") {
  const safeBuffer = bufferHtml ?? "";
  return HTML_PREFIX + safeBuffer + HTML_SUFFIX;
}

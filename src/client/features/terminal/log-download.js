import { buildLogHtml } from "../../../shared/log-template.js";

export function formatLogTimestamp(date) {
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const year = date.getFullYear();
  let hours = date.getHours();
  const ampm = hours >= 12 ? "pm" : "am";
  hours %= 12;
  if (hours === 0) {
    hours = 12;
  }
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${month}_${day}_${year}_${hours}${minutes}${ampm}`;
}

export function sanitizeLogBaseName(rawBaseName, fallback = "game") {
  return String(rawBaseName || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase() || fallback;
}

export function resolveLogBaseName({ isMultiMud, gameName }) {
  if (isMultiMud) {
    return "dome-client";
  }

  return sanitizeLogBaseName(gameName || "game");
}

export function buildLogDownloadFilename({ now = new Date(), isMultiMud = false, gameName = "game" } = {}) {
  return `${resolveLogBaseName({ isMultiMud, gameName })}.log.${formatLogTimestamp(now)}.html`;
}

export function buildLogDownloadHtml({ bufferHtml = "", logExportCss = "", inlineLogCss = true } = {}) {
  return buildLogHtml(bufferHtml, logExportCss, inlineLogCss);
}

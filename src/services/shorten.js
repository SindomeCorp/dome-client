import config from "../config/index.js";
import logger from "../logger.js";

const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#()/%?=~_|!:,.;]*[-A-Z0-9+&()@#/%=~_|])/ig;
const shortCache = new Map();
const cacheLimit = config.shorten.cacheLimit ?? 300;
const minimum = Math.max(25, config.shorten.minimum);
const defaultRequestTimeout = 2000;

async function shortenOne(url) {
  if (!url || url.length < minimum) return null;
  if (shortCache.has(url)) {
    const cached = shortCache.get(url);
    shortCache.delete(url);
    shortCache.set(url, cached);
    return cached;
  }
  const controller = new AbortController();
  const timeout = config.shorten.requestTimeout ?? defaultRequestTimeout;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(
      `http://${config.shorten.host}:${config.shorten.port}${config.shorten.path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `url=${encodeURIComponent(url)}`,
        signal: controller.signal
      }
    );
    if (!res.ok) return null;
    const response = await res.json();
    if (response?.url !== url) return null;
    const { key } = response;
    if ((typeof key !== "string" && !Number.isFinite(key)) || String(key).trim() === "") {
      return null;
    }
    const protocol = config.shorten.useHttps ? "https" : "http";
    const newUrl = `${protocol}://${config.shorten.domain}/${key}`;
    shortCache.set(url, newUrl);
    if (shortCache.size > cacheLimit) {
      const firstKey = shortCache.keys().next().value;
      shortCache.delete(firstKey);
    }
    logger.debug(url + " >> " + newUrl);
    return newUrl;
  } catch (err) {
    if (err.name === "AbortError") {
      logger.warn("url shortener request timed out");
    } else {
      logger.warn(`url shortener connection failed: ${err.message}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function urls(data) {
  try {
    const matches = data.match(urlRegex);
    if (!matches) return data;
    const replacements = await Promise.all(matches.map(async (url) => {
      try {
        return await shortenOne(url);
      } catch (err) {
        logger.warn("failed to shorten url", err);
        return null;
      }
    }));
    // Apply results to the original match positions, regardless of completion order.
    let index = 0;
    return data.replace(urlRegex, (url) => replacements[index++] ?? url);
  } catch (err) {
    logger.warn("shortening urls failed", err);
    return data;
  }
}

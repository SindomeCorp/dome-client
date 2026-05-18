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
    const response = await res.json();
    if (response.url && response.url === url) {
      const newUrl = `http://${config.shorten.domain}/${response.key}`;
      shortCache.set(url, newUrl);
      if (shortCache.size > cacheLimit) {
        const firstKey = shortCache.keys().next().value;
        shortCache.delete(firstKey);
      }
      logger.debug(url + " >> " + newUrl);
      return newUrl;
    }
    return null;
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
    let output = data;
    await Promise.all(matches.map(async url => {
      try {
        const newUrl = await shortenOne(url);
        if (newUrl) {
          output = output.replace(url, newUrl);
        }
      } catch (err) {
        logger.warn("failed to shorten url", err);
      }
    }));
    return output;
  } catch (err) {
    logger.warn("shortening urls failed", err);
    return data;
  }
}

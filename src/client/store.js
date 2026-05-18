import logger from "./pages/logger.js";

function direct() {
  return localStorage;
}

function put(k, v) {
  try {
    if (localStorage) {
      return localStorage.setItem(k, JSON.stringify(v));
    }
  } catch (e) {
    logger.error(e);
  }
  return false;
}

function get(k) {
  try {
    if (localStorage) {
      const raw = localStorage.getItem(k);
      if (raw === null) {
        return null;
      }
      try {
        return JSON.parse(raw);
      } catch (e) {
        logger.warn(`Ignoring corrupt localStorage value for ${k}: ${raw}`);
        localStorage.removeItem(k);
        return null;
      }
    }
  } catch (e) {
    logger.error(e);
  }
  return null;
}

function remove(k) {
  try {
    if (localStorage) {
      localStorage.removeItem(k);
    }
  } catch (e) {
    logger.error(e);
  }
}

const store = { direct, put, get, remove };

export { store, direct, put, get, remove };

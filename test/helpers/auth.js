/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import nock from "nock";
import config from "../../src/config/index.js";

export function setupAuth({ status, response, error, body = { email: "a", pass: "b" } } = {}) {
  const { host, path } = config.remoteAuth;
  const targetUrl = new URL(path, host);
  const base = targetUrl.origin;
  const requestPath = targetUrl.pathname;
  let scope;
  if (typeof error !== "undefined") {
    scope = nock(base).post(requestPath).replyWithError(error);
  } else if (typeof status !== "undefined") {
    scope = nock(base).post(requestPath).reply(status, response);
  }
  const req = { body, session: {} };
  const redirect = { url: undefined };
  const res = {};
  const done = new Promise((resolve) => {
    res.redirect = (url) => {
      redirect.url = url;
      resolve();
    };
  });
  return { req, res, scope, redirect, done };
}

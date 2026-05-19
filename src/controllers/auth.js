import path from "node:path";
import { fileURLToPath } from "node:url";
import { named } from "../logger.js";
import qs from "node:querystring";
import md5 from "md5";
import config from "../config/index.js";
import { sessionError } from "./session-error.js";

const __filename = fileURLToPath(import.meta.url);
const logger = named("controllers/" + path.basename(__filename, ".js"));

/**
 * Authenticate a user against the remote website and set session data.
 * On success, user information is stored and the destination is chosen
 * based on `gogogo` or `return` parameters. Errors store a session
 * message and redirect back to the home page.
 */
export async function login(req, res) {
  if (!config.remoteAuth.enabled) {
    sessionError(req, "Website authentication is disabled.");
    return res.redirect("/");
  }

  const authOptions = config.remoteAuth;
  const formBody = qs.stringify({
    email: req.body.email,
    pass: req.body.pass,
    signature: md5(authOptions.remoteSecret)
  });
  const url = new URL(authOptions.path, authOptions.host).toString();

  try {
    const remoteRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formBody
    });

    const authJSON = await remoteRes.json();
    let dest = "/";
    if (authJSON.status == "ok") {
      const remoteUser = authJSON.user && typeof authJSON.user === "object" ? authJSON.user : {};
      const chars = Array.isArray(remoteUser.chars)
        ? remoteUser.chars.filter(char => char && typeof char.name === "string" && char.name.length)
        : [];
      req.session.user = { ...remoteUser, chars };
      if (req.body["gogogo"] && req.session["user"]) {
        if (chars.length && chars[0].name) {
          dest = "/?auto=" + chars[0].name;
        }
      }
      if (req.body["return"] && req.body.return.indexOf("/") == 0) {
        dest = req.body.return;
      }
    } else {
      sessionError(req, authJSON.message || "Unexpected error occurred while authenticating user against website.");
    }
    res.redirect(dest);
  } catch (e) {
    logger.error(e);
    sessionError(req, e.message || "Unhandled exception thrown while authenticating user against website");
    res.redirect("/");
  }
}

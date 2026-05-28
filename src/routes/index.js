import express from "express";
import path from "path";
import * as auth from "../controllers/auth.js";
import * as autocomplete from "../controllers/autocomplete.js";
import * as screens from "../controllers/screens.js";
import * as save from "../controllers/save.js";
import * as status from "../controllers/status.js";
import * as health from "../controllers/health.js";

const router = express.Router();

/**
 * Serve Let's Encrypt HTTP-01 challenges without auth.
 * Certbot will write files into:
 *   /var/www/letsencrypt/.well-known/acme-challenge/<TOKEN>
 *
 * If you prefer a different location, set ACME_WEBROOT in your env.
 */
const ACME_WEBROOT = process.env.ACME_WEBROOT || "/var/www/letsencrypt";
router.use(
  "/.well-known/acme-challenge",
  // Serve ONLY the acme-challenge dir
  express.static(
    path.join(ACME_WEBROOT, ".well-known", "acme-challenge"),
    {
      dotfiles: "allow",
      index: false,
      etag: false,
      maxAge: 0,
    }
  )
);

router.get("/", screens.connect);
router.post("/", screens.connect);
router.get("/game-owner-questions/", screens.gameOwnerQuestions);
router.get("/player-client/", screens.client);
router.post("/website-login/", auth.login);
router.get("/editor/:type/", screens.editor);
router.get("/ac/:type", autocomplete.basic);
router.post("/save/:filename", save.log);
router.get("/moo/status/", status.get);
router.get("/health/", health.get);

export default router;

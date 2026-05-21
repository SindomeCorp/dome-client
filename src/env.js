import childProcess from "node:child_process";
import { cleanEnv, str, num, bool } from "envalid";
import dotenv from "dotenv";

dotenv.config();

let gitHash = process.env.GIT_HASH;
if (!gitHash) {
  try {
    gitHash = childProcess
      .execSync("git log --format=\"%H\" --max-count=1 less/*")
      .toString()
      .trim();
  } catch {
    gitHash = "";
  }
}

const env = cleanEnv(process.env, {
  NODE_MODE: str({ default: "dev" }),
  NODE_PORT: num({ default: 80 }),
  NODE_SOCKET_URL: str({ default: "http://localhost:8080" }),
  NODE_SOCKET_URL_SSL: str({ default: "" }),
  NODE_SOCKET_PROXIED: bool({ default: false }),
  NODE_POWERED_BY: str({ default: "Dome Client" }),
  LOG_LEVEL: str({ default: "info" }),
  SESSION_SECRET: str({ default: "dev-session-secret-change-me" }),
  SSL_PORT: num({ default: 443 }),
  SSL_KEY: str({ default: "" }),
  SSL_CERT: str({ default: "" }),
  SSL_PASSPHRASE: str({ default: "" }),
  MOO_NAME: str({ default: "Anaconda" }),
  MOO_HOST: str({ default: "moo.sindome.org" }),
  MOO_PORT: num({ default: 5555 }),
  WEBSITE_BASE: str({ default: "" }),
  WEBSITE_SIGNUP_URL: str({ default: "" }),
  GUEST_CONNECT_COMMAND: str({ default: "connect guest" }),
  AUTOCOMPLETE_ENABLED: bool({ default: false }),
  AUTOCOMPLETE_P: str({ default: "data/autocomplete/player.txt" }),
  AUTOCOMPLETE_J: str({ default: "data/autocomplete/justice.txt" }),
  AUTOCOMPLETE_A: str({ default: "data/autocomplete/agent.txt" }),
  AUTOCOMPLETE_C: str({ default: "data/autocomplete/creator.txt" }),
  AUTOCOMPLETE_W: str({ default: "data/autocomplete/watcher.txt" }),
  AUTOCOMPLETE_O: str({ default: "data/autocomplete/guest.txt" }),
  LOCAL_SAVE_NODE_MAX_LINES: num({ default: 200 }),
  LOCAL_SAVE_NODE_ADMIN_MAX_LINES: num({ default: 800 }),
  LOCAL_SAVE_NOTE_MAX_LINES: num({ default: 20 }),
  IDE_EDIT_OPEN_PARENT: bool({ default: false }),
  IDE_VMS_NOTE_ENABLED: bool({ default: false }),
  SHORTEN_ENABLED: bool({ default: false }),
  SHORTEN_HOST: str({ default: "localhost" }),
  SHORTEN_PORT: num({ default: 5549 }),
  SHORTEN_PATH: str({ default: "/interface/v1/shorten/" }),
  SHORTEN_DOMAIN: str({ default: "" }),
  SHORTEN_MINIMUM: num({ default: 50 }),
  REMOTEAUTH_ENABLED: bool({ default: false }),
  REMOTEAUTH_HOST: str({ default: "http://localhost" }),
  REMOTEAUTH_PATH: str({ default: "/session/authenticate/" }),
  REMOTEAUTH_REMOTE_SECRET: str({ default: "dev-remoteauth-secret-change-me" }),
  STATUS_SERVICE_URL: str({ default: "" }),
  GIT_HASH: str({ default: gitHash })
});

process.env.GIT_HASH = env.GIT_HASH;
process.env.LOG_LEVEL = env.LOG_LEVEL;

export default env;

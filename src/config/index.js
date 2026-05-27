import env from "../env.js";

const config = {
  node: {
    mode: env.NODE_MODE,
    port: env.NODE_PORT,
    socketUrl: env.NODE_SOCKET_URL,
    socketUrlSSL: env.NODE_SOCKET_URL_SSL,
    socketProxied: env.NODE_SOCKET_PROXIED,
    multiMud: env.MULTI_MUD,
    poweredBy: env.NODE_POWERED_BY,
    session: {
      secret: env.SESSION_SECRET
    }
  },
  moo: {
    name: env.MUD_NAME,
    host: env.MUD_HOST,
    port: env.MUD_PORT
  },
  website: {
    signupUrl: env.WEBSITE_SIGNUP_URL
  },
  guest: {
    connectCommand: env.GUEST_CONNECT_COMMAND
  },
  autocomplete: {
    enabled: env.AUTOCOMPLETE_ENABLED,
    p: env.AUTOCOMPLETE_P,
    j: env.AUTOCOMPLETE_J,
    a: env.AUTOCOMPLETE_A,
    c: env.AUTOCOMPLETE_C,
    w: env.AUTOCOMPLETE_W,
    o: env.AUTOCOMPLETE_O
  },
  editor: {
    localSaveNodeMaxLines: env.LOCAL_SAVE_NODE_MAX_LINES,
    localSaveNodeAdminMaxLines: env.LOCAL_SAVE_NODE_ADMIN_MAX_LINES,
    localSaveNoteMaxLines: env.LOCAL_SAVE_NOTE_MAX_LINES,
    ideEditOpenParent: env.IDE_EDIT_OPEN_PARENT,
    ideVmsNoteEnabled: env.IDE_VMS_NOTE_ENABLED
  },
  shorten: {
    enabled: env.SHORTEN_ENABLED,
    host: env.SHORTEN_HOST,
    port: env.SHORTEN_PORT,
    path: env.SHORTEN_PATH,
    domain: env.SHORTEN_DOMAIN,
    minimum: env.SHORTEN_MINIMUM
  },
  remoteAuth: {
    enabled: env.REMOTEAUTH_ENABLED,
    host: env.REMOTEAUTH_HOST,
    path: env.REMOTEAUTH_PATH,
    remoteSecret: env.REMOTEAUTH_REMOTE_SECRET
  },
  status: {
    serviceUrl: env.STATUS_SERVICE_URL
  }
};

if (env.SSL_KEY && env.SSL_CERT) {
  config.ssl = {
    port: env.SSL_PORT,
    key: env.SSL_KEY,
    cert: env.SSL_CERT,
    passphrase: env.SSL_PASSPHRASE
  };
}

export default config;

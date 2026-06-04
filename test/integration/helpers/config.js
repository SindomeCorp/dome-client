/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
const defaultIntegrationConfig = {
  node: {
    mode: "test",
    port: 0,
    socketUrl: "",
    socketUrlSSL: "",
    socketProxied: false,
    multiMud: false,
    healthEndpointEnabled: true,
    poweredBy: "Dome Client",
    session: {
      secret: "integration-test-secret"
    }
  },
  moo: {
    name: "Integration MUD",
    host: "127.0.0.1",
    port: 4444
  },
  website: {
    signupUrl: ""
  },
  guest: {
    connectCommand: "connect guest"
  },
  autocomplete: {
    enabled: false,
    p: "data/autocomplete/player.txt",
    j: "data/autocomplete/justice.txt",
    a: "data/autocomplete/agent.txt",
    c: "data/autocomplete/creator.txt",
    w: "data/autocomplete/watcher.txt",
    o: "data/autocomplete/guest.txt"
  },
  editor: {
    localSaveNodeMaxLines: 200,
    localSaveNodeAdminMaxLines: 800,
    localSaveNoteMaxLines: 20,
    ideEditOpenParent: false,
    ideVmsNoteEnabled: false,
    ideObjectBrowserEnabled: true,
    idePropertyBrowserEnabled: true,
    ideHoverOverlaysEnabled: true,
    ideReferenceNavigationEnabled: true,
    ideScratchEnabled: true
  },
  shorten: {
    enabled: false,
    host: "localhost",
    port: 5549,
    path: "/interface/v1/shorten/",
    domain: "",
    minimum: 50
  },
  remoteAuth: {
    enabled: true,
    host: "http://remoteauth.test",
    path: "/session/authenticate/",
    remoteSecret: "sekret"
  },
  status: {
    serviceUrl: "http://status.test/moo/status/"
  },
  security: {
    ipBlocklistPath: ""
  }
};

function clone(value) {
  return structuredClone(value);
}

function mergeConfig(target, overrides = {}) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = mergeConfig(target[key] ? { ...target[key] } : {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

export function createIntegrationConfig(overrides = {}) {
  return mergeConfig(clone(defaultIntegrationConfig), overrides);
}

export { defaultIntegrationConfig };

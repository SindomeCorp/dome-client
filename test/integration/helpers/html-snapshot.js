/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import request from "supertest";
import nock from "nock";

async function bootServer(t, configOverrides) {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  const config = {
    node: {
      mode: "test",
      port: 0,
      socketUrl: "",
      socketUrlSSL: "",
      socketProxied: false,
      multiMud: false,
      poweredBy: "Dome Client",
      session: { secret: "integration-test-secret" }
    },
    moo: { name: "Integration MUD", host: "127.0.0.1", port: 4444 },
    website: { signupUrl: "" },
    guest: { connectCommand: "connect guest" },
    autocomplete: { enabled: false },
    editor: {
      localSaveNodeMaxLines: 200,
      localSaveNodeAdminMaxLines: 800,
      localSaveNoteMaxLines: 20,
      ideEditOpenParent: false,
      ideVmsNoteEnabled: false
    },
    shorten: { enabled: false, host: "localhost", port: 5549, path: "/interface/v1/shorten/", domain: "", minimum: 50 },
    remoteAuth: { enabled: true, host: "http://remoteauth.test", path: "/session/authenticate/", remoteSecret: "sekret" },
    status: { serviceUrl: "" }
  };

  if (configOverrides.node) Object.assign(config.node, configOverrides.node);
  if (configOverrides.remoteAuth) Object.assign(config.remoteAuth, configOverrides.remoteAuth);
  if (configOverrides.status) Object.assign(config.status, configOverrides.status);

  moduleMock("../../../src/config/index.js", { defaultExport: config });
  moduleMock("../../../src/logger.js", {
    namedExports: {
      named: () => ({ info() {}, warn() {}, error() {}, debug() {} })
    }
  });
  moduleMock("../../../src/controllers/socket.js", {
    namedExports: { connection() {}, error() {} }
  });

  const { start, stop } = await import(`../../../src/server.js?snapshot=${Date.now()}-${Math.random()}`);
  const runtime = await start({ port: 0, ip: "127.0.0.1", skipBuild: true });

  t.after(async () => {
    await stop();
    t.mock.restoreAll();
    nock.cleanAll();
    nock.enableNetConnect();
  });

  return `http://127.0.0.1:${runtime.http.port}`;
}

function textContent(node) {
  return node ? node.textContent.trim().replace(/\s+/g, " ") : "";
}

function projectSnapshot(html, urlPath) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const h1Nodes = Array.from(document.querySelectorAll("h1"));
  return {
    path: urlPath,
    title: textContent(document.querySelector("title")),
    h1: h1Nodes.map(textContent),
    hasWebsiteLogin: /Website Login/i.test(document.body.textContent || ""),
    hasConnectToHeading: /Connect To \.\.\./i.test(document.body.textContent || ""),
    hasPlayNow: /Play Now/i.test(document.body.textContent || ""),
    hasLineBuffer: Boolean(document.querySelector("#lineBuffer")),
    hasGameHealth: Boolean(document.querySelector("#gameHealth")),
    hasGameHealthDetail: Boolean(document.querySelector("#gameHealthDetail")),
    hasGameOwnerGuideLink: Boolean(document.querySelector("a[href=\"/game-owner-questions/\"]")),
    hasGameOwnerGuideHeading: /Game Owner Questions/i.test(document.body.textContent || "")
  };
}

export async function runHtmlSnapshotCase(t, {
  configOverrides,
  path: urlPath,
  goldenFile
}) {
  nock.disableNetConnect();
  nock.enableNetConnect("127.0.0.1");

  if (configOverrides?.status?.serviceUrl) {
    nock("http://status.test")
      .persist()
      .get("/moo/status/")
      .reply(200, {
        message: "moo ok",
        cpu: 0,
        memory: 0,
        checked: Date.now(),
        users: 0,
        interval: 15,
        state: "OK"
      }, { "Content-Type": "application/json" });
  }

  const baseUrl = await bootServer(t, configOverrides || {});
  const res = await request(baseUrl).get(urlPath).expect(200);
  const snapshot = projectSnapshot(res.text, urlPath);

  const absoluteGolden = path.join(process.cwd(), goldenFile);
  if (process.env.UPDATE_GOLDEN === "1") {
    await fs.writeFile(absoluteGolden, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    return;
  }
  const expected = JSON.parse(await fs.readFile(absoluteGolden, "utf8"));
  assert.deepEqual(snapshot, expected);
}

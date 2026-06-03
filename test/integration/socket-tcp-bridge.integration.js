/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { io as createSocketClient } from "socket.io-client";

async function startMooTestServer() {
  let received = "";
  const server = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      received += text;
      if (text.includes("look\r\n")) {
        socket.write("You look around.\r\n");
      }
      if (text.includes("@quit\r\n")) {
        socket.end();
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address();
  return {
    port: address.port,
    getReceived() {
      return received;
    },
    close() {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    }
  };
}

async function bootSocketServer(t, mooPort) {
  const moduleMock = typeof t.mock.module === "function"
    ? t.mock.module.bind(t.mock)
    : t.mock.import.bind(t.mock);

  moduleMock("../../src/config/index.js", {
    defaultExport: {
      node: {
        mode: "test",
        port: 0,
        socketUrl: "",
        socketUrlSSL: "",
        socketProxied: false,
        multiMud: false,
        poweredBy: "Dome Client",
        session: {
          secret: "integration-test-secret"
        }
      },
      moo: {
        name: "Integration MUD",
        host: "127.0.0.1",
        port: mooPort
      },
      website: {
        signupUrl: ""
      },
      guest: {
        connectCommand: "connect guest"
      },
      autocomplete: {
        enabled: false,
        p: "data/autocomplete/player.txt"
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
        enabled: false,
        host: "http://remoteauth.test",
        path: "/session/authenticate/",
        remoteSecret: "sekret"
      },
      status: {
        serviceUrl: ""
      }
    }
  });

  moduleMock("../../src/logger.js", {
    defaultExport: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      child() {
        return this;
      }
    },
    namedExports: {
      named: () => ({
        info() {},
        warn() {},
        error() {},
        debug() {},
      }),
      inspect() {}
    }
  });

  moduleMock("node:dns", {
    namedExports: {
      promises: {
        reverse: async () => []
      }
    }
  });

  const { start, stop } = await import(`../../src/server.js?socket-real-tcp=${Date.now()}`);
  const runtime = await start({ port: 0, ip: "127.0.0.1", skipBuild: true });
  t.after(async () => {
    await stop();
    t.mock.restoreAll();
  });

  return {
    baseUrl: `http://127.0.0.1:${runtime.http.port}`
  };
}

test("integration: socket bridge works with a real tcp moo server", async (t) => {
  const moo = await startMooTestServer();
  t.after(async () => {
    await moo.close();
  });

  const { baseUrl } = await bootSocketServer(t, moo.port);

  const socketData = [];
  await new Promise((resolve, reject) => {
    const socket = createSocketClient(baseUrl, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("timed out waiting for real tcp socket bridge flow"));
    }, 3500);
    timer.unref?.();

    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });

    socket.on("connect", () => {
      socket.emit("input", "look");
    });

    socket.on("data", (message) => {
      socketData.push(String(message));
      if (String(message).includes("You look around.")) {
        socket.emit("input", "@quit");
      }
    });

    socket.on("disconnected", () => {
      socket.once("disconnect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.disconnect();
    });
  });

  const received = moo.getReceived();
  assert.match(received, /look\r\n/);
  assert.match(received, /@quit\r\n/);
  assert.ok(socketData.some((chunk) => chunk.includes("You look around.")));
});

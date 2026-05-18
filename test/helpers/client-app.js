/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import http from "node:http";
import https from "node:https";

export default async function loadClientApp(t) {
  const { mock } = t;
  mock.method(globalThis, "setInterval", () => {});
  mock.method(globalThis, "setTimeout", () => {});

  let app;
  const httpHandlers = {};
  const httpsHandlers = {};
  const httpServer = {
    listen() {},
    on(event, handler) {
      httpHandlers[event] = handler;
    }
  };
  const httpsServer = {
    listen() {},
    on(event, handler) {
      httpsHandlers[event] = handler;
    }
  };

  const httpMock = { ...http, createServer(expressApp) { app = expressApp; return httpServer; } };
  mock.module("node:http", { defaultExport: httpMock, namedExports: httpMock });

  const httpsMock = { ...https, createServer(options, expressApp) { app = expressApp; void options; return httpsServer; } };
  mock.module("node:https", { defaultExport: httpsMock, namedExports: httpsMock });

  let httpMgr;
  let httpsMgr;
  class Server {
    constructor(server) {
      const handlers = server === httpsServer ? httpsHandlers : httpHandlers;
      this.on = (evt, handler) => {
        handlers[evt] = handler;
      };
      if (server === httpsServer) {
        httpsMgr = this;
      } else {
        httpMgr = this;
      }
    }
  }
  mock.module("socket.io", { namedExports: { Server } });

  await import(`../../src/server.js?${Date.now()}`);

  return { app, httpHandlers, httpsHandlers, httpMgr, httpsMgr };
}

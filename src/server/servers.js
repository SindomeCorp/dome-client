import defaultFs from "node:fs";
import defaultHttp from "node:http";
import defaultHttps from "node:https";
import { Server as DefaultSocketServer } from "socket.io";
import { resolveClientIpFromRequest } from "../services/ip-blocklist.js";

function createSslOptions({ config, fs = defaultFs }) {
  if (!config.ssl) {
    return null;
  }

  const sslOptions = {
    key: fs.readFileSync(config.ssl.key),
    cert: fs.readFileSync(config.ssl.cert)
  };
  if (config.ssl.ca) {
    sslOptions["ca"] = fs.readFileSync(config.ssl.ca);
  }
  if (config.ssl.passphrase) {
    sslOptions["passphrase"] = config.ssl.passphrase;
  }
  return sslOptions;
}

export function createHttpServers({
  app,
  config,
  logger,
  ipBlocklist,
  fs = defaultFs,
  http = defaultHttp,
  https = defaultHttps,
  SocketServer = DefaultSocketServer
}) {
  const socketOptions = createSocketOptions({ config, logger, ipBlocklist });
  const server = http.createServer(app);
  const httpMgr = new SocketServer(server, socketOptions);
  app.set("socketServer", httpMgr);
  logger.info("socket.io listening to http");

  const sslOptions = createSslOptions({ config, fs });
  if (!sslOptions) {
    return {
      server,
      httpMgr,
      sslServer: undefined,
      httpsMgr: undefined
    };
  }

  const sslServer = https.createServer(sslOptions, app);
  const httpsMgr = new SocketServer(sslServer, {
    ...sslOptions,
    ...socketOptions
  });
  app.set("httpsSocketServer", httpsMgr);
  logger.info("socket.io listening to https");

  return {
    server,
    httpMgr,
    sslServer,
    httpsMgr
  };
}

function createSocketOptions({ config, logger, ipBlocklist }) {
  return {
    allowRequest(req, callback) {
      const ip = resolveClientIpFromRequest(req, { proxied: config.node.socketProxied });
      if (ipBlocklist?.has(ip)) {
        logger.warn("Blocked socket.io request from " + ip);
        callback("Forbidden", false);
        return;
      }
      callback(null, true);
    }
  };
}

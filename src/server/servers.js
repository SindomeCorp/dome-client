import defaultFs from "node:fs";
import defaultHttp from "node:http";
import defaultHttps from "node:https";
import { Server as DefaultSocketServer } from "socket.io";

export function createSslOptions({ config, fs = defaultFs }) {
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
  fs = defaultFs,
  http = defaultHttp,
  https = defaultHttps,
  SocketServer = DefaultSocketServer
}) {
  const server = http.createServer(app);
  const httpMgr = new SocketServer(server);
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
  const httpsMgr = new SocketServer(sslServer, sslOptions);
  app.set("httpsSocketServer", httpsMgr);
  logger.info("socket.io listening to https");

  return {
    server,
    httpMgr,
    sslServer,
    httpsMgr
  };
}

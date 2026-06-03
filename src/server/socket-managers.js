import * as defaultSocket from "../controllers/socket.js";

export function bindSocketManagers({
  httpMgr,
  httpsMgr,
  socket = defaultSocket
}) {
  httpMgr.on("connection", function(sock) {
    socket.connection(sock, httpMgr);
  });
  httpMgr.on("error", socket.error);

  if (httpsMgr) {
    httpsMgr.on("connection", socket.connection);
    httpsMgr.on("error", socket.error);
  }
}

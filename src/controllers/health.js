import os from "node:os";

function extractSockets(server) {
  if (typeof server.of === "function") {
    const namespace = server.of("/");
    if (namespace?.sockets) {
      return namespace.sockets;
    }
  }
  if (server.sockets?.sockets) {
    return server.sockets.sockets;
  }
  return server.sockets;
}

function countCollection(collection) {
  if (!collection) {
    return 0;
  }
  if (Number.isFinite(collection.size)) {
    return collection.size;
  }
  if (Number.isFinite(collection.length)) {
    return collection.length;
  }
  if (typeof collection === "object") {
    return Object.keys(collection).length;
  }
  return 0;
}

function countConnections(server) {
  if (!server) {
    return 0;
  }
  if (Number.isFinite(server.engine?.clientsCount)) {
    return server.engine.clientsCount;
  }
  return countCollection(extractSockets(server));
}

function formatCpuLoad(loadAvg) {
  const [one, five, fifteen] = Array.isArray(loadAvg) ? loadAvg : [];
  return {
    "1m": Number.isFinite(one) ? one : 0,
    "5m": Number.isFinite(five) ? five : 0,
    "15m": Number.isFinite(fifteen) ? fifteen : 0
  };
}

function resolveLastRestart(startTime) {
  if (startTime instanceof Date) {
    return startTime.toISOString();
  }
  if (startTime) {
    const parsed = new Date(startTime);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  const fallback = new Date(Date.now() - process.uptime() * 1000);
  return fallback.toISOString();
}

export function get(req, res) {
  const memoryUsage = process.memoryUsage();
  const httpServer = req.app?.get?.("socketServer");
  const httpsServer = req.app?.get?.("httpsSocketServer");

  const payload = {
    currentRss: memoryUsage.rss,
    currentHeapUsed: memoryUsage.heapUsed,
    currentlyConnected: countConnections(httpServer) + countConnections(httpsServer),
    cpuLoad: formatCpuLoad(os.loadavg()),
    lastRestart: resolveLastRestart(req.app?.get?.("appStartTime"))
  };

  res.json(payload);
  return payload;
}


import net from "node:net";

export const DEFAULT_SOCKET_CONNECT_TIMEOUT_MS = 5000;

export async function connectToMud({
  host,
  port,
  timeoutMs = DEFAULT_SOCKET_CONNECT_TIMEOUT_MS,
  netConnect = net.connect
}) {
  return await new Promise((resolve, reject) => {
    const conn = netConnect({ port, host });
    const timer = setTimeout(() => {
      reject(new Error("socket connect timeout"));
    }, timeoutMs);
    if (typeof timer?.unref === "function") {
      timer.unref();
    }
    const settle = (fn) => (value) => {
      clearTimeout(timer);
      fn(value);
    };
    conn.once("connect", settle(() => resolve(conn)));
    conn.once("error", settle(reject));
  });
}

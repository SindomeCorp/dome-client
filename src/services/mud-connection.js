import net from "node:net";
import tls from "node:tls";

export const DEFAULT_SOCKET_CONNECT_TIMEOUT_MS = 5000;

export async function connectToMud({
  host,
  port,
  useTls = false,
  signal,
  timeoutMs = DEFAULT_SOCKET_CONNECT_TIMEOUT_MS,
  netConnect = net.connect,
  tlsConnect = tls.connect
}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const connect = useTls ? tlsConnect : netConnect;
    const conn = connect({ port, host });
    const readyEvent = useTls ? "secureConnect" : "connect";
    let timer;

    function cleanup() {
      clearTimeout(timer);
      conn.removeListener(readyEvent, ready);
      conn.removeListener("error", fail);
      conn.removeListener("close", closed);
      signal?.removeEventListener("abort", abort);
    }

    function ready() {
      cleanup();
      resolve(conn);
    }

    function fail(error) {
      cleanup();
      conn.destroy?.();
      reject(error);
    }

    function closed() { fail(new Error("socket closed before connecting")); }
    function abort() { fail(signal.reason); }

    conn.once(readyEvent, ready);
    conn.once("error", fail);
    conn.once("close", closed);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    timer = setTimeout(() => fail(new Error("socket connect timeout")), timeoutMs);
    timer?.unref?.();
  });
}

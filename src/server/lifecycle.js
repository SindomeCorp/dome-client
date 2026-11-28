export function listen(server, ...args) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    const onError = (error) => {
      server.removeListener("error", onError);
      server.removeListener("listening", onListening);
      reject(error);
    };

    server.on("error", onError);
    try {
      server.listen(...args, onListening);
    } catch (error) {
      onError(error);
    }
  });
}

export function resolveBoundAddress(server) {
  if (!server || typeof server.address !== "function") {
    return null;
  }
  const address = server.address();
  if (!address) {
    return null;
  }
  if (typeof address === "string") {
    return { type: "pipe", path: address };
  }
  return {
    type: "tcp",
    address: address.address,
    family: address.family,
    port: address.port
  };
}

export function close(server) {
  return new Promise(resolve => {
    if (!server || typeof server.close !== "function") {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

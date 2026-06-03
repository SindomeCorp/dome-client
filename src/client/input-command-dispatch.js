const echoCommand = (client, command) => {
  if (client.preferences.localEcho) {
    client.buffer.insertAdjacentHTML("beforeend", "<span class=\"input-echo\">&gt;" + command + "</span>\n");
  }
};

export const createCommandDispatcher = ({ client, socket, getSocket = () => socket ?? client.socket }) => ({
  sendCommand(command) {
    if (command.startsWith("@client-option")) {
      echoCommand(client, command);
      if (client.parseClientOptionCommand) client.parseClientOptionCommand(command);
    } else if (command === "@test") {
      echoCommand(client, command);
      client.openIDE?.({
        editorName: "Test Tab",
        uploadCommand: "@save-test",
        buffer: "This is some test data"
      });
    } else {
      echoCommand(client, command);
      const activeSocket = getSocket();
      if (!activeSocket || typeof activeSocket.emit !== "function") {
        client.health?.showStatus("ERROR: socket is not connected", { persist: true });
        return;
      }
      activeSocket.emit("input", command, (state) => {
        client.health?.showStatus(
          (state.status && state.status.indexOf("command sent") == 0) ? "SENT" : state.status
        );
      });
    }
  }
});

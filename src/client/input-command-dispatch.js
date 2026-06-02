const echoCommand = (dome, command) => {
  if (dome.preferences.localEcho) {
    dome.buffer.insertAdjacentHTML("beforeend", "<span class=\"input-echo\">&gt;" + command + "</span>\n");
  }
};

export const createCommandDispatcher = ({ dome, socket, getSocket = () => socket ?? dome.socket }) => ({
  sendCommand(command) {
    if (command.startsWith("@client-option")) {
      echoCommand(dome, command);
      if (dome.parseClientOptionCommand) dome.parseClientOptionCommand(command);
    } else if (command === "@test") {
      echoCommand(dome, command);
      dome.openIDE?.({
        editorName: "Test Tab",
        uploadCommand: "@save-test",
        buffer: "This is some test data"
      });
    } else {
      echoCommand(dome, command);
      const activeSocket = getSocket();
      if (!activeSocket || typeof activeSocket.emit !== "function") {
        if (dome.setFadeText && dome.statusDisplay) {
          dome.setFadeText(dome.statusDisplay, "ERROR: socket is not connected", true);
        }
        return;
      }
      activeSocket.emit("input", command, (state) => {
        if (dome.setFadeText && dome.statusDisplay) {
          dome.setFadeText(
            dome.statusDisplay,
            (state.status && state.status.indexOf("command sent") == 0) ? "SENT" : state.status,
            false
          );
        }
      });
    }
  }
});

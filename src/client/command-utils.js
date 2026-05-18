export function parseCommand(commandString = "") {
  const [command = "", ...rest] = commandString.trim().split(/\s+/);
  return { command, commandTarget: rest.join(" ") };
}

export function getCommandLabel(commandString = "", editorName = "") {
  let raw = commandString;
  if (!raw || raw === "none") {
    if (!editorName || editorName === "none") return "";
    raw = editorName;
  }
  const { command, commandTarget } = parseCommand(raw);
  if (command === "@@set_note") return `Editing Note: ${editorName}`.trim();

  if (command === "@@set") return `${commandTarget} (LIST)`;
  if (
    command === "@program" ||
    command === "@set-note-text" ||
    command === "@set-note-string" ||
    command === "@scratch"
  ) {
    return commandTarget;
  }
  if (command === "@grep") {
    return `${command} ${commandTarget}`.trim();
  }
  if (command) {
    return `${command} ${commandTarget}`.trim();
  }
  return "";
}

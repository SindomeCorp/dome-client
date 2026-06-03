import {
  formatEditPropertyCommand,
  formatEditVerbCommand,
  formatPropertyListCommand,
  formatVerbListCommand
} from "./protocol.js";

export function useIdeBrowserCommands({ dispatchIde, emitInput }) {
  const onLoadVerbs = (objectId) => {
    dispatchIde({ type: "loadObjectVerbs", objectId });
    emitInput(formatVerbListCommand(objectId));
  };

  const onLoadProps = (objectId) => {
    dispatchIde({ type: "loadObjectProperties", objectId });
    emitInput(formatPropertyListCommand(objectId));
  };

  const onEditVerb = (objectId, rawVerbName) => {
    const command = formatEditVerbCommand(objectId, rawVerbName);
    if (!command) return;
    emitInput(command);
  };

  const onEditProperty = (objectId, rawPropertyName) => {
    const command = formatEditPropertyCommand(objectId, rawPropertyName);
    if (!command) return;
    emitInput(command);
  };

  const toggleObjectCollapsed = (objectId) => {
    dispatchIde({ type: "toggleObjectCollapsed", objectId });
  };

  const togglePropertyCollapsed = (objectId) => {
    dispatchIde({ type: "togglePropertyCollapsed", objectId });
  };

  return {
    onEditProperty,
    onEditVerb,
    onLoadProps,
    onLoadVerbs,
    toggleObjectCollapsed,
    togglePropertyCollapsed
  };
}

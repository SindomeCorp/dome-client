export const CONTEXT_MENUS_KEY = "dc-context-menus";
// Keep startup independent of disk JSON so missing or broken profile files cannot
// break the build. Server availability gates this snapshot and saved local JSON.
export function defaultContextMenus() {
  return {
    version: 1,
    rules: [{
      id: "player-channel", priority: 350,
      pattern: "\\[[+-]\\]\\[(?<channel>[^\\]\\r\\n]{1,128})\\]",
      captures: { channel: "channel-name" },
      actions: [{ id: "rewind", label: "@rewind", type: "game-command", template: "@rewind ${channel}" }]
    }],
    profiles: [{
      id: "player", label: "Player", rules: ["player-channel"],
      selectionActions: [{ id: "copy", label: "Copy selected text", type: "client-action", action: "clipboard.copy", input: "selection" }]
    }]
  };
}
export * from "./context-menu-validation.js";

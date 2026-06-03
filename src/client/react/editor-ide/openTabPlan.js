import { parseCommand } from "../../command-utils.js";
import {
  PROPERTY_EDIT_COMMANDS,
  parseObjectPropertyTarget
} from "./targets.js";
import {
  buildTitle,
  createEditableTab
} from "./tabs.js";

export const DUPLICATE_TAB_MESSAGE =
  "@@editor-message There was already a tab with that information open so we have switched the view to that. We did not update the contents.";

function createEditorTabId() {
  return Date.now() + Math.random();
}

export function classifyEditorCommand(editor) {
  const title = buildTitle(editor);
  const { command, commandTarget } = parseCommand(editor.uploadCommand || "");
  const name = editor.name || `${editor.editorName || ""}|${commandTarget || ""}`;
  const isProgramCommand = command === "@program";
  const isEditVerbTarget = command === "@edit" && commandTarget.includes(":");
  const isEditPropTarget = command === "@edit" && commandTarget.includes(".") && !commandTarget.includes(":");
  const isVerbContext = isProgramCommand || isEditVerbTarget;
  const isPropertyContext = PROPERTY_EDIT_COMMANDS.has(command) || isEditPropTarget;

  return {
    command,
    commandTarget,
    isProgramCommand,
    isPropertyContext,
    isVerbContext,
    name,
    title
  };
}

export function buildOpenTabPlan(editor, documents, idFactory = createEditorTabId) {
  const classification = classifyEditorCommand(editor);
  const existing = documents.find((tab) => tab.name === classification.name);
  if (existing) {
    return {
      duplicateMessage: DUPLICATE_TAB_MESSAGE,
      id: existing.id,
      type: "activateExisting"
    };
  }

  const id = idFactory();
  return {
    browserEffects: getBrowserEffects(classification),
    objectBrowser: classification.isVerbContext,
    propertyBrowser: classification.isPropertyContext,
    tab: createEditableTab({
      id,
      editor,
      title: classification.title,
      command: classification.command,
      commandTarget: classification.commandTarget,
      name: classification.name,
      isProgramCommand: classification.isProgramCommand
    }),
    type: "openEditableTab"
  };
}

function getBrowserEffects({ commandTarget, isPropertyContext, isVerbContext }) {
  if (isVerbContext) {
    const splitAt = commandTarget.indexOf(":");
    if (splitAt > 0 && splitAt < commandTarget.length - 1) {
      const objectId = commandTarget.slice(0, splitAt).trim();
      const verbName = commandTarget.slice(splitAt + 1).trim();
      if (objectId && verbName) {
        return [{ type: "upsertObjectVerb", objectId, verbLabel: verbName }];
      }
    }
  }

  if (isPropertyContext) {
    const parsedTarget = parseObjectPropertyTarget(commandTarget);
    if (parsedTarget) {
      return [{
        type: "upsertObjectProperty",
        objectId: parsedTarget.objectId,
        propertyLabel: parsedTarget.propertyName
      }];
    }
  }

  return [];
}

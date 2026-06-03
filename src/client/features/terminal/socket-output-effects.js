import { setupAutoCompleteFeature } from "./autocomplete.js";

export function createSocketOutputEventHandler({
  client,
  logger,
  renderer,
  setupAutoComplete = setupAutoCompleteFeature
}) {
  const withFadeText = (msg) => {
    client.health?.showStatus(msg);
  };

  const handleEditorContent = (event) => {
    const editor = event.editor;
    const spawned = client.makeEditor(editor);
    if (event.updateEditorList) {
      client.spawned[editor.editorName] = spawned;
      client.updateEditorListView();
    } else if (spawned) {
      client.spawned[editor.editorName] = spawned;
      client.updateEditorListView();
    }
  };

  const postIdeMessage = (message) => {
    if (client.ideWindow && !client.ideWindow.closed) {
      client.ideWindow.postMessage(message, "*");
      return true;
    }
    return false;
  };

  const handleSdwcVerbOverlay = (event) => {
    const hasIdeWindow = Boolean(client.ideWindow && !client.ideWindow.closed);
    if (event.objectId && event.verbName && hasIdeWindow) {
      logger.debug("[SDWC overlay parsed][verb]", {
        objectId: event.objectId,
        verbName: event.verbName,
        payload: event.payload
      });
      postIdeMessage({
        type: "ide-verb-overlay",
        objectId: event.objectId,
        verbName: event.verbName,
        payload: event.payload
      });
      return;
    }

    logger.debug("[SDWC overlay parsed ignored][verb]", {
      hasObject: Boolean(event.objectId),
      hasVerb: Boolean(event.verbName),
      hasIdeWindow,
      payload: event.payload
    });
  };

  const handleSdwcPropOverlay = (event) => {
    const hasIdeWindow = Boolean(client.ideWindow && !client.ideWindow.closed);
    if (event.objectId && event.propertyName && hasIdeWindow) {
      logger.debug("[SDWC overlay parsed][prop]", {
        objectId: event.objectId,
        propertyName: event.propertyName,
        payload: event.payload
      });
      postIdeMessage({
        type: "ide-prop-overlay",
        objectId: event.objectId,
        propertyName: event.propertyName,
        payload: event.payload
      });
      return;
    }

    logger.debug("[SDWC overlay parsed ignored][prop]", {
      hasObject: Boolean(event.objectId),
      hasProperty: Boolean(event.propertyName),
      hasIdeWindow,
      payload: event.payload
    });
  };

  return function handleProtocolEvent(event) {
    if (event.type === "text") {
      return renderer.appendOutputSegment(event.text);
    }
    if (event.type === "editor-content") {
      handleEditorContent(event);
    } else if (event.type === "fade") {
      withFadeText(event.message);
    } else if (event.type === "user-type") {
      client.userType = event.userType;
      if (client.inputReader) {
        setupAutoComplete({ client });
        client.setupAutoComplete?.(client.inputReader, client.userType);
      }
    } else if (event.type === "ping") {
      withFadeText("pinged");
    } else if (event.type === "sdwc-nowrap-start") {
      renderer.startSdwcNowrapBlock();
    } else if (event.type === "sdwc-nowrap-end") {
      renderer.endSdwcNowrapBlock();
    } else if (event.type === "sdwc-verbs") {
      postIdeMessage({ type: "ide-object-verbs", payload: event.payload });
    } else if (event.type === "sdwc-props") {
      postIdeMessage({ type: "ide-object-props", payload: event.payload });
    } else if (event.type === "sdwc-verb-overlay") {
      handleSdwcVerbOverlay(event);
    } else if (event.type === "sdwc-prop-overlay") {
      handleSdwcPropOverlay(event);
    } else if (event.type === "sdwc-parse-error") {
      logger.warn(`Failed to parse ${event.command.replace("sdwc-", "SDWC ").toUpperCase()} payload`, event.error);
    }

    return client.buffer.childNodes.length;
  };
}

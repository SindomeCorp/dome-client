import { useEffect, useRef } from "react";

export function useIdeMessages({
  addTab,
  applyObjectPropsPayload,
  applyObjectVerbsPayload,
  handlePropOverlayPayload,
  handleVerbOverlayPayload,
  setEditorFont
}) {
  const handlers = useRef({
    addTab,
    applyObjectPropsPayload,
    applyObjectVerbsPayload,
    handlePropOverlayPayload,
    handleVerbOverlayPayload,
    setEditorFont
  });

  useEffect(() => {
    handlers.current = {
      addTab,
      applyObjectPropsPayload,
      applyObjectVerbsPayload,
      handlePropOverlayPayload,
      handleVerbOverlayPayload,
      setEditorFont
    };
  });

  useEffect(() => {
    const handler = (e) => {
      const current = handlers.current;
      const message = getMessageData(e);
      if (!message) return;
      if (message.type === "ide-open-tab") {
        if (message.editor && typeof message.editor === "object") {
          current.addTab(message.editor);
        }
      } else if (message.type === "ide-object-verbs") {
        current.applyObjectVerbsPayload(message.payload);
      } else if (message.type === "ide-object-props") {
        current.applyObjectPropsPayload(message.payload);
      } else if (message.type === "ide-verb-overlay") {
        current.handleVerbOverlayPayload(message);
      } else if (message.type === "ide-prop-overlay") {
        current.handlePropOverlayPayload(message);
      } else if (message.type === "ide-set-font" || message.type === "set-editor-font") {
        if (typeof message.font === "string") {
          current.setEditorFont(message.font);
        }
      }
    };
    window.addEventListener("message", handler);
    if (typeof window.opener?.postMessage === "function") {
      window.opener.postMessage({ type: "ide-ready" }, "*");
    }
    return () => window.removeEventListener("message", handler);
  }, []);
}

function getMessageData(event) {
  if (!event?.data || typeof event.data !== "object" || Array.isArray(event.data)) {
    return null;
  }
  return typeof event.data.type === "string" ? event.data : null;
}

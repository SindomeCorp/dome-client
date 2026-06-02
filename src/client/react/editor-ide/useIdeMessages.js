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
      if (e.data && e.data.type === "ide-open-tab") {
        current.addTab(e.data.editor);
      } else if (e.data && e.data.type === "ide-object-verbs") {
        current.applyObjectVerbsPayload(e.data.payload);
      } else if (e.data && e.data.type === "ide-object-props") {
        current.applyObjectPropsPayload(e.data.payload);
      } else if (e.data && e.data.type === "ide-verb-overlay") {
        current.handleVerbOverlayPayload(e.data);
      } else if (e.data && e.data.type === "ide-prop-overlay") {
        current.handlePropOverlayPayload(e.data);
      } else if (e.data && (e.data.type === "ide-set-font" || e.data.type === "set-editor-font")) {
        current.setEditorFont(e.data.font);
      }
    };
    window.addEventListener("message", handler);
    window.opener?.postMessage({ type: "ide-ready" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);
}

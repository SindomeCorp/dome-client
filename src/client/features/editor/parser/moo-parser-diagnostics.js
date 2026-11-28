import {
  MOO_EDITOR_PARSER,
  normalizeEditorParser
} from "../ace/editor-options.js";

const PARSE_DEBOUNCE_MS = 300;

export function attachMooParserDiagnostics(editor, parser, options = {}) {
  if (normalizeEditorParser(parser) !== MOO_EDITOR_PARSER) {
    return () => {};
  }
  if (typeof Worker !== "function") {
    return () => {};
  }

  const session = editor.getSession();
  const worker = new Worker("/js/moo-parser-worker.js", { type: "module" });
  let timer = null;
  let sequence = 0;
  let active = true;
  let hasAnnotations = false;

  const applyAnnotations = (annotations) => {
    hasAnnotations = annotations.length > 0;
    session.setAnnotations(annotations);
    options.onAnnotations?.(annotations);
  };

  const requestParse = (id) => {
    if (!active) return;
    worker.postMessage({
      type: "parse",
      id,
      source: editor.getValue()
    });
  };

  const scheduleParse = () => {
    clearTimeout(timer);
    // An edit invalidates an in-flight reply before its replacement is sent.
    timer = setTimeout(requestParse, PARSE_DEBOUNCE_MS, ++sequence);
  };

  worker.addEventListener("message", (event) => {
    const { id, annotations } = event.data || {};
    if (!active || id !== sequence) return;
    applyAnnotations(Array.isArray(annotations) ? annotations : []);
  });

  const handleChange = () => {
    scheduleParse();
    // Display and Save checks must stop using diagnostics for the previous text.
    if (hasAnnotations) applyAnnotations([]);
  };
  editor.on("change", handleChange);
  scheduleParse();

  return () => {
    active = false;
    clearTimeout(timer);
    if (typeof editor.off === "function") {
      editor.off("change", handleChange);
    }
    applyAnnotations([]);
    worker.terminate();
  };
}

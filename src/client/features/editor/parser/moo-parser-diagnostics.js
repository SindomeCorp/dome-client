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

  const requestParse = () => {
    if (!active) return;
    const id = ++sequence;
    worker.postMessage({
      type: "parse",
      id,
      source: editor.getValue()
    });
  };

  const scheduleParse = () => {
    clearTimeout(timer);
    timer = setTimeout(requestParse, PARSE_DEBOUNCE_MS);
  };

  worker.addEventListener("message", (event) => {
    const { id, annotations } = event.data || {};
    if (!active || id !== sequence) return;
    const nextAnnotations = Array.isArray(annotations) ? annotations : [];
    session.setAnnotations(nextAnnotations);
    options.onAnnotations?.(nextAnnotations);
  });

  const handleChange = () => scheduleParse();
  editor.on("change", handleChange);
  scheduleParse();

  return () => {
    active = false;
    clearTimeout(timer);
    if (typeof editor.off === "function") {
      editor.off("change", handleChange);
    }
    session.setAnnotations([]);
    options.onAnnotations?.([]);
    worker.terminate();
  };
}

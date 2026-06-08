import { Language, Parser } from "/js/parsers/web-tree-sitter.js";
import { collectMooBlockDiagnostics } from "../features/editor/parser/moo-block-diagnostics.js";

const RUNTIME_WASM_PATH = "/js/parsers/web-tree-sitter.wasm";
const MOO_WASM_PATH = "/js/parsers/tree-sitter-moo.wasm";

let parserPromise = null;

async function getParser() {
  if (!parserPromise) {
    parserPromise = (async () => {
      await Parser.init({
        locateFile(scriptName) {
          return scriptName.endsWith(".wasm") ? RUNTIME_WASM_PATH : scriptName;
        }
      });
      const language = await Language.load(MOO_WASM_PATH);
      const parser = new Parser();
      parser.setLanguage(language);
      return parser;
    })();
  }
  return parserPromise;
}

function annotationForNode(node) {
  const isMissing = node.isMissing;
  const start = node.startPosition;
  return {
    row: start.row,
    column: start.column,
    text: isMissing
      ? `Missing ${node.type}`
      : "MOO syntax error",
    type: "error"
  };
}

function isBroadErrorNode(node) {
  return node?.isError && node.startPosition?.row === 0 && node.endPosition?.row > 0;
}

function collectSyntaxAnnotations(node, annotations = [], options = {}) {
  if (!node?.hasError) return annotations;
  if ((node.isError || node.isMissing) && !(options.suppressBroadErrors && isBroadErrorNode(node))) {
    annotations.push(annotationForNode(node));
  }
  for (const child of node.children || []) {
    collectSyntaxAnnotations(child, annotations, options);
  }
  return annotations;
}

function dedupeAnnotations(annotations) {
  const seen = new Set();
  return annotations.filter((annotation) => {
    const key = `${annotation.row}:${annotation.column}:${annotation.text}:${annotation.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

self.addEventListener("message", async (event) => {
  const { id, source, type } = event.data || {};
  if (type !== "parse") return;

  try {
    const sourceText = String(source || "");
    const parser = await getParser();
    const tree = parser.parse(sourceText);
    const blockAnnotations = collectMooBlockDiagnostics(sourceText);
    const syntaxAnnotations = collectSyntaxAnnotations(tree.rootNode, [], {
      suppressBroadErrors: blockAnnotations.length > 0
    });
    const annotations = dedupeAnnotations([...blockAnnotations, ...syntaxAnnotations]);
    self.postMessage({ id, annotations });
    tree.delete();
  } catch (err) {
    self.postMessage({
      id,
      annotations: [{
        row: 0,
        column: 0,
        text: err?.message || "MOO parser failed",
        type: "warning"
      }]
    });
  }
});

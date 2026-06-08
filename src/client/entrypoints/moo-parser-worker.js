import { Language, Parser } from "/js/parsers/web-tree-sitter.js";

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

function collectSyntaxAnnotations(node, annotations = []) {
  if (!node?.hasError) return annotations;
  if (node.isError || node.isMissing) {
    annotations.push(annotationForNode(node));
  }
  for (const child of node.children || []) {
    collectSyntaxAnnotations(child, annotations);
  }
  return annotations;
}

self.addEventListener("message", async (event) => {
  const { id, source, type } = event.data || {};
  if (type !== "parse") return;

  try {
    const parser = await getParser();
    const tree = parser.parse(String(source || ""));
    const annotations = collectSyntaxAnnotations(tree.rootNode);
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

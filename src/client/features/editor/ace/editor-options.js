export const MOO_TAB_SIZE = 2;
export const MOO_EDITOR_PARSER = "moo";

export function configureEditorTheme(editor, theme) {
  if (!theme) return;
  // The saved client option uses a different spelling from the Ace module.
  const aceTheme = theme === "ambience" ? "ambiance" : theme;
  editor.setTheme(`ace/theme/${aceTheme}`);
}

export function configureMooEditor(editor) {
  editor.getSession().setMode("ace/mode/moo");
  editor.setOption("tabSize", MOO_TAB_SIZE);
  editor.setOption("useSoftTabs", true);
}

export function normalizeEditorParser(parser) {
  return String(parser || "").trim().toLowerCase() === MOO_EDITOR_PARSER
    ? MOO_EDITOR_PARSER
    : "";
}

export function configureEditorParser(editor, parser) {
  if (normalizeEditorParser(parser) === MOO_EDITOR_PARSER) {
    configureMooEditor(editor);
    return;
  }
  editor.getSession().setMode("ace/mode/text");
}

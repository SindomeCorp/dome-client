export const MOO_TAB_SIZE = 2;

export function configureMooEditor(editor) {
  editor.getSession().setMode("ace/mode/moo");
  editor.setOption("tabSize", MOO_TAB_SIZE);
  editor.setOption("useSoftTabs", true);
}

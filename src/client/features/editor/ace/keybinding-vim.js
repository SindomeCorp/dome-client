import ace from "ace-builds/src-noconflict/ace.js";
import "ace-builds/src-noconflict/keybinding-vim.js";

ace.config.setModuleUrl("ace/keyboard/vim", import.meta.url);

const Vim = ace.require("ace/keyboard/vim").CodeMirror.Vim;
Vim.map("jk", "<Esc>", "insert");
Vim.map("jk", "j");

export {};

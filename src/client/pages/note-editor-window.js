import ace from "ace-builds/src-noconflict/ace.js";
import "ace-builds/src-noconflict/theme-tomorrow_night_blue.js";
import "../ace/keybinding-vim.js";
import "../ace/mode-moo.js";
import { getFontFamily } from "../ace/fonts.js";

ace.config.set("basePath", "/js/ace");

import { setupEditor, attachUpload, attachAbort } from "./editor-utils.js";

let verbEditor = null;

document.addEventListener("DOMContentLoaded", () => {
  let data = window.editorData;
  if (data == null) {
    data = { "editorName": "Scratch", "uploadCommand": "none", "buffer": "", "note": { "subject": "", "notebody": "", "createdat": new Date() } };
  }

  const uploadCommand = data.uploadCommand;
  const editorName = data.editorName;
  const buffer = data.buffer;
  const initial = { value: buffer };

  const cta = document.querySelector("button.upload");
  const abort = document.querySelector("button.abort");
  const basicEditor = document.querySelector("div.editor textarea");
  const status = document.querySelector(".editor .status");
  const editorEl = document.querySelector("#verb-editor-holder");
  if (editorEl) {
    verbEditor = ace.edit("verb-editor-holder");
    const theme = editorEl.getAttribute("data-editor-theme");
    if (theme) {
      verbEditor.setTheme(`ace/theme/${theme}`);
    }
    verbEditor.getSession().setMode("ace/mode/moo");
    verbEditor.setOption("fontFamily", getFontFamily());
    window.addEventListener("message", (e) => {
      if (e.data && e.data.type === "set-editor-font") {
        const ff = getFontFamily(e.data.font);
        verbEditor.setOption("fontFamily", ff);
      }
    });
  }

  if (verbEditor != null) {
    verbEditor.setValue(buffer);
    initial.value = verbEditor.getValue();
  } else if (basicEditor != null) {
    basicEditor.textContent = buffer;
    initial.value = basicEditor.value;
  }

  const subjectField = document.querySelector(".editor .note-header .note-subject .header-value");
  if (subjectField) subjectField.textContent = data.note.subject;

  const tsField = document.querySelector(".editor .note-header .note-timestamp .header-value");
  if (tsField) tsField.textContent = data.note.createdat;

  if (data.note["references"]) {
    const refField = document.querySelector(".editor .note-header .note-objects .header-value");
    let refHTML = "";
    for (let i = 0; i < data.note.references.length; i++) {
      const ref = data.note.references[i];
      refHTML += "<a href=\"javascript:void(0);\" class=\"obj-text\" data-obj=\"#" + ref.objectnumber + "\">" + ref.objectname + " (#" + ref.objectnumber + ")</a>";
    }
    if (refField) refField.innerHTML = refHTML;
  }

  if (data.note["history"]) {
    const authorField = document.querySelector(".editor .note-header .note-authors .header-value");
    let authorHTML = "";
    for (let i = 0; i < data.note.history.length; i++) {
      const author = data.note.history[i];
      authorHTML += "<a href=\"javascript:void(0);\" class=\"obj-text\" data-obj=\"#" + author.objectnumber + "\">" + author.objectname + "</a>";
    }
    if (authorField) authorField.innerHTML = authorHTML;
  }

  // initial setup
  setupEditor({ uploadCommand, editorName, cta });

  // upload button
  const getUploadData = () => (verbEditor != null ? verbEditor.getValue() : basicEditor.value);
  const showStatus = (msg, type) => {
    if (!status) return;
    status.textContent = msg;
    status.className = "status " + type;
  };
  attachUpload({
    uploadCommand,
    cta,
    getUploadData,
    setInitial: (v) => { initial.value = v; },
    validate: (txt) => txt.trim().length > 0,
    onSuccess: () => { showStatus("Saved", "success"); },
    onError: () => { showStatus("Note cannot be empty", "error"); }
  });

  // abort or close button
  attachAbort({
    abortButton: abort,
    getValue: () => (verbEditor != null ? verbEditor.getValue() : basicEditor.value),
    initialValueRef: initial,
    onAbort: () => { window.close(); }
  });
});

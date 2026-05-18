import ace from "ace-builds/src-noconflict/ace.js";
import "ace-builds/src-noconflict/theme-tomorrow_night_blue.js";
import "../ace/keybinding-vim.js";
import "../ace/mode-moo.js";
import { getFontFamily } from "../ace/fonts.js";

ace.config.set("basePath", "/js/ace");

import logger from "./logger.js";
import { setupEditor, attachUpload, attachAbort } from "./editor-utils.js";

let verbEditor = null;

document.addEventListener("DOMContentLoaded", () => {
  let data = window.editorData;
  if (data == null) {
    data = { "editorName": "Scratch", "uploadCommand": "none", "buffer": "" };
  }

  const uploadCommand = data.uploadCommand;
  const editorName = data.editorName;
  const buffer = data.buffer;
  const initial = { value: buffer };

  const cta = document.querySelector("button.upload");
  const abort = document.querySelector("button.abort");
  const basicEditor = document.querySelector("div.editor textarea");
  let warnBeforeUnload = false;

  const editorEl = document.querySelector("#verb-editor-holder");
  if (editorEl) {
    verbEditor = ace.edit("verb-editor-holder");
    const theme = editorEl.getAttribute("data-editor-theme");
    if (theme) {
      verbEditor.setTheme(`ace/theme/${theme}`);
    }
    verbEditor.getSession().setMode("ace/mode/moo");
    verbEditor.setOption("fontFamily", getFontFamily());
    verbEditor.commands.addCommand({
      name: "vim-enable",
      bindKey: { win: "Ctrl-1", mac: "Ctrl-1|Command-1" },
      exec: function () {
        verbEditor.setKeyboardHandler("ace/keyboard/vim");
        document.getElementById("verb-status-holder").textContent = "VIM MODE";
      },
      readOnly: true
    });
    verbEditor.commands.addCommand({
      name: "vim-disable",
      bindKey: { win: "Ctrl-0", mac: "Ctrl-0|Command-0" },
      exec: function () {
        verbEditor.setKeyboardHandler("");
        document.getElementById("verb-status-holder").textContent = "REGULAR MODE";
      },
      readOnly: true
    });
    verbEditor.commands.addCommand({
      name: "save",
      bindKey: { win: "Ctrl-s", mac: "Ctrl-s|Command-s" },
      exec: function () {
        document.querySelector(".menu .upload")?.click();
      },
      readOnly: true
    });
    verbEditor.getSession().on("change", () => {
      warnBeforeUnload = verbEditor.getValue() !== initial.value;
    });
    window.addEventListener("message", (e) => {
      if (e.data && e.data.type === "set-editor-font") {
        const ff = getFontFamily(e.data.font);
        verbEditor.setOption("fontFamily", ff);
      }
    });
  }

  const updateEditor = (content) => {
    logger.info("updating editor ...");
    logger.debug(verbEditor);
    if (verbEditor != null) {
      verbEditor.setValue(content);
      initial.value = verbEditor.getValue();
    } else if (basicEditor != null) {
      basicEditor.textContent = content;
      initial.value = basicEditor.value;
    } else {
      logger.warn("no editor found");
    }
  };
  updateEditor(buffer);

  if (basicEditor) {
    basicEditor.addEventListener("input", () => {
      warnBeforeUnload = basicEditor.value !== initial.value;
    });
  }

  // initial setup
  setupEditor({ uploadCommand, editorName, cta });

  // upload button
  const getUploadData = () => {
    let uploadData = "";
    if (verbEditor != null) {
      uploadData = verbEditor.getValue();
      // update sync in status
      const currentdate = new Date();
      const datetime = "Last Save: " +
        currentdate.getHours() + ":" +
        currentdate.getMinutes() + ":" +
        currentdate.getSeconds();
      const statusHolder = document.querySelector("#verb-status-holder");
      if (statusHolder) {
        statusHolder.innerHTML = datetime;
      }
    } else {
      uploadData = basicEditor.value;
    }
    return uploadData;
  };

  attachUpload({
    uploadCommand,
    cta,
    getUploadData,
    setInitial: (v) => { initial.value = v; },
    onSuccess: () => { warnBeforeUnload = false; }
  });

  let safelyClosed = false;
  const notifyParentOnClose = function(eName) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "editorClosed", editorName: eName }, "*");
    }
    if (window.parentWindow && window.parentWindow.dome && window.parentWindow.dome) {
      window.parentWindow.dome.editorClosed(eName);
    }
  };

  // abort or close button
  attachAbort({
    abortButton: abort,
    getValue: () => (verbEditor != null ? verbEditor.getValue() : basicEditor.value),
    initialValueRef: initial,
    onAbort: () => {
      notifyParentOnClose(editorName);
      warnBeforeUnload = false;
      safelyClosed = true;
      window.close();
    }
  });

  const handleBeforeUnload = (event) => {
    if (warnBeforeUnload && !safelyClosed) {
      event.preventDefault();
      event.returnValue = "";
      return "";
    }
    notifyParentOnClose(editorName);
  };
  window.addEventListener("beforeunload", handleBeforeUnload);
});

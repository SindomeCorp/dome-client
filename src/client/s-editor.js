import { dome, socket, logger } from "./b-variables.js";

export const getSocket = () => window.uploadSocket || dome.socket;

dome.setupEditorSupport = function() {


  // analyze the editor properties to determine which editor
  dome.makeEditor = function ( editor ) {

    let editWindow = null;

    if ( Object.prototype.hasOwnProperty.call( dome.spawned, editor.editorName ) && dome.spawned[ editor.editorName ] != null ) {
      editWindow = dome.spawned[ editor.editorName ];
      editWindow.focus();
      if ( !editWindow.confirm( "Replace existing editor of the same name? You may have active edits." ) ) {
        return null;
      }
    }

    // if there is no upload command, its a read only editor
    let type = "basic-readonly";
    if ( editor.uploadCommand ) {
      if ( editor.uploadCommand.indexOf( "@program" ) != -1 ) {
        // verb editor
        type = "verb";
      } else {
        // theres some other command
        type = "basic";
      }
    }

    if ( editor[ "type" ] ) {
      type = editor[ "type" ];
    }

    // strip leading linebreaks
    editor.buffer = editor.buffer.replace(/^\n/, "").replace(/[\r\n]+$/, "");

    if (dome.preferences.editorType === "ide") {
      dome.openIDE?.(editor);
      return null;
    }

    const editorURL = "/editor/" + type + "/?et=" + dome.preferences.edittheme + "&ts=" + (new Date()).getTime();
    if ( editWindow != null && Object.prototype.hasOwnProperty.call( editWindow, "updateEditor" ) ) {
      editWindow.updateEditor( editor.buffer );
    } else {
      const windowConfig = "width=640,height=480,resizeable,scrollbars";
      editWindow = window.open( editorURL, "" + editor.editorName, windowConfig );
    }

    editWindow.editorData = editor;
    editWindow.uploadSocket = socket;
    editWindow.parentWindow = window;
    editWindow.addEventListener("beforeunload", () => {
      dome.editorClosed(editor.editorName);
    });
    editWindow.focus();

    return editWindow;
  };

  dome.updateEditorListView = function () {
    const v = dome.editorListView;
    if ( v == null ) {
      logger.warn("no editor list view");
      return;
    }
    v.style.display = "none";
    v.innerHTML = "";
    if ( Object.keys( dome.spawned ).length === 0 ) {
      return;
    }
    let listHTML = "<ul>";
    for ( const title in dome.spawned ) {
      if ( !dome.spawned.hasOwnProperty( title ) ) {
        continue;
      }
      const editWin = dome.spawned[ title ];
      if ( editWin != null ) {
        listHTML += "<li data-editor=\"" + title + "\">";
        listHTML += "<span data-editor=\"" + title + "\" class=\"truncate\" title=\"" + title + "\">" + title + "</span>";
        listHTML += "<a data-editor=\"" + title + "\" title=\"close editor\" href=\"javascript:void(0);\">";
        listHTML += "<i data-editor=\"" + title + "\" class=\"glyph-button-close\"></i></a></li>";
      }
    }
    listHTML += "</ul>";
    v.innerHTML = listHTML;
    v.style.display = "";
  };

  

  const editorListClicked = function(editorName, action) {
    logger.debug(editorName, action, dome.spawned[editorName]);
    if (dome.spawned[editorName] != null) {
      dome.spawned[editorName].focus();
      if (action == "close") {
        dome.spawned[editorName].close();
        delete dome.spawned[editorName];
      }
    }
    dome.updateEditorListView();

  };


  if (dome.editorListView != null) {
    dome.editorListView.addEventListener("click", (e) => {
      if (!e.target) {
        return;
      }
      const editorName = e.target.getAttribute("data-editor");
      editorListClicked( editorName, ( e.target.tagName !== "I" && e.target.tagName !== "A") ?  "zoom" : "close" );
    });
  }

  dome.editorClosed = function(editorName) {
    if ( Object.prototype.hasOwnProperty.call(dome.spawned, editorName)) {
      delete dome.spawned[editorName];
      dome.updateEditorListView();
    }
  };

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (data && data.type === "editorClosed" && data.editorName) {
      dome.editorClosed(data.editorName);
    }
  });
};

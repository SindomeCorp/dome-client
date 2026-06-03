import { logger } from "../../core/constants.js";

export const getSocket = ({ client, win = globalThis.window } = {}) => win.uploadSocket || client?.socket;

export function setupEditorSupport({ client, win = globalThis.window } = {}) {


  // analyze the editor properties to determine which editor
  client.makeEditor = function ( editor ) {

    let editWindow = null;

    if ( Object.prototype.hasOwnProperty.call( client.spawned, editor.editorName ) && client.spawned[ editor.editorName ] != null ) {
      editWindow = client.spawned[ editor.editorName ];
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

    if (client.preferences.editorType === "ide") {
      client.openIDE?.(editor);
      return null;
    }

    const editorURL = "/editor/" + type + "/?et=" + client.preferences.edittheme + "&ts=" + (new Date()).getTime();
    if ( editWindow != null && Object.prototype.hasOwnProperty.call( editWindow, "updateEditor" ) ) {
      editWindow.updateEditor( editor.buffer );
    } else {
      const windowConfig = "width=640,height=480,resizeable,scrollbars";
      editWindow = win.open( editorURL, "" + editor.editorName, windowConfig );
    }

    editWindow.editorData = editor;
    editWindow.uploadSocket = getSocket({ client, win });
    editWindow.parentWindow = win;
    editWindow.addEventListener("beforeunload", () => {
      client.editorClosed(editor.editorName);
    });
    editWindow.focus();

    return editWindow;
  };

  client.updateEditorListView = function () {
    const v = client.editorListView;
    if ( v == null ) {
      logger.warn("no editor list view");
      return;
    }
    v.style.display = "none";
    v.innerHTML = "";
    if ( Object.keys( client.spawned ).length === 0 ) {
      return;
    }
    let listHTML = "<ul>";
    for ( const title in client.spawned ) {
      if ( !client.spawned.hasOwnProperty( title ) ) {
        continue;
      }
      const editWin = client.spawned[ title ];
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
    logger.debug(editorName, action, client.spawned[editorName]);
    if (client.spawned[editorName] != null) {
      client.spawned[editorName].focus();
      if (action == "close") {
        client.spawned[editorName].close();
        delete client.spawned[editorName];
      }
    }
    client.updateEditorListView();

  };


  if (client.editorListView != null) {
    client.editorListView.addEventListener("click", (e) => {
      if (!e.target) {
        return;
      }
      const editorName = e.target.getAttribute("data-editor");
      editorListClicked( editorName, ( e.target.tagName !== "I" && e.target.tagName !== "A") ?  "zoom" : "close" );
    });
  }

  client.editorClosed = function(editorName) {
    if ( Object.prototype.hasOwnProperty.call(client.spawned, editorName)) {
      delete client.spawned[editorName];
      client.updateEditorListView();
    }
  };

  win.addEventListener("message", (event) => {
    const data = event.data;
    if (data && data.type === "editorClosed" && data.editorName) {
      client.editorClosed(data.editorName);
    }
  });
}

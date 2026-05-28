import config from "../config/index.js";
import { connectedStats } from "../services/multi-mud-metrics.js";

export function connect(req, res) {
  const gameName = config.moo.name;
  const isMultiMud = config.node.multiMud === true;
  const stats = isMultiMud ? connectedStats() : { count: 0, games: [] };
  res.render("connect-as", {
    mooName: config.moo.name,
    isMultiMud,
    mooHostname: config.moo.host,
    mooPort: config.moo.port,
    connected: () => stats,
    showWebsiteAuth: config.remoteAuth.enabled,
    signupUrl: config.website.signupUrl,
    "meta": {
      "title": "Connect - Modern Gaming Client",
      "description": `Connect to ${gameName} using its state of the art Modern Gaming Client. No flash, no plugins, just a modern browser. Play with your iPad or check in from the company computer. There's nothing to install.`,
      "keywords": `moo-client, telnet client, modern gaming client, play ${gameName.toLowerCase()}, text-based game, websocket-telnet`
    }
  });
}

export function client(req, res) {
  const gameName = config.moo.name;
  const statusServiceUrl = config.status.serviceUrl ? String(config.status.serviceUrl).trim() : "";
  res.render("client", {
    showStatusService: Boolean(statusServiceUrl),
    statusServiceUrl,
    "meta": {
      "title": `${gameName}'s Modern Gaming Client`,
      "description": `Someone playing ${gameName} via ${gameName}'s Modern Gaming Client`,
      "keywords": `moo-client, telnet client, modern gaming client, play ${gameName.toLowerCase()}, text-based game, websocket-telnet`
    }
  });
}

export function gameOwnerQuestions(req, res) {
  if (config.node.multiMud !== true) {
    res.status(404).send("Not Found");
    return;
  }

  res.render("game-owner-questions", {
    "meta": {
      "title": "Game Owner Questions - Modern Gaming Client",
      "description": "How game owners can use this web-based client and request player host/IP metadata during login.",
      "keywords": "mud client, game owner, dome-client-user, connection metadata"
    }
  });
}

export function editor(req, res) {
  const gameName = config.moo.name;
  const editorType = req.params.type;
  let template = editorType;
  if (editorType != "verb" && editorType != "note-viewer" && editorType != "ide") {
    template = "basic";
  }
  res.render("editors/" + template, {
    editor: {
      "readonly": req.params.type == "basic-readonly" ? true : false,
      "localSaveNodeMaxLines": config.editor.localSaveNodeMaxLines,
      "localSaveNodeAdminMaxLines": config.editor.localSaveNodeAdminMaxLines,
      "localSaveNoteMaxLines": config.editor.localSaveNoteMaxLines,
      "ideEditOpenParent": config.editor.ideEditOpenParent,
      "ideVmsNoteEnabled": config.editor.ideVmsNoteEnabled
    },
    "meta": {
      "title": "Untitled Local Editor ",
      "description": `Local editor window for the ${gameName} Modern Gaming Client.`,
      "keywords": "gaming client editor"
    },
    layout: false
  });
}

import React, { useState, useEffect, useRef } from "react";
import ace from "ace-builds/src-noconflict/ace.js";
import "ace-builds/src-noconflict/theme-tomorrow_night_blue.js";
import "../ace/keybinding-vim.js";
import "../ace/mode-moo.js";
import "ace-builds/src-noconflict/mode-text.js";
import { getSocket } from "../s-editor.js";
import { parseCommand, getCommandLabel } from "../command-utils.js";
import { getPreferredFont, getFontFamily } from "../ace/fonts.js";

ace.config.set("basePath", "/js/ace");

const DEFAULT_LOCAL_SAVE_NODE_MAX_LINES = 200;
const DEFAULT_LOCAL_SAVE_NODE_ADMIN_MAX_LINES = 800;
const DEFAULT_LOCAL_SAVE_NOTE_MAX_LINES = 20;
const PROPERTY_EDIT_COMMANDS = new Set(["@set-note-string", "@set-note-text"]);
const EMPTY_VMS_PROMPT_STATE = { open: false, tabId: null, value: "" };

export default function EditorIDE() {
  const rootEl = document.getElementById("root");
  const editorTheme = rootEl.getAttribute("data-editor-theme") || "twilight";
  const localSaveNodeMaxLines =
    Number(rootEl.getAttribute("data-local-save-node-max-lines")) ||
    DEFAULT_LOCAL_SAVE_NODE_MAX_LINES;
  const localSaveNodeAdminMaxLines =
    Number(rootEl.getAttribute("data-local-save-node-admin-max-lines")) ||
    DEFAULT_LOCAL_SAVE_NODE_ADMIN_MAX_LINES;
  const localSaveNoteMaxLines =
    Number(rootEl.getAttribute("data-local-save-note-max-lines")) ||
    DEFAULT_LOCAL_SAVE_NOTE_MAX_LINES;
  const ideEditOpenParent = rootEl.getAttribute("data-ide-edit-open-parent") === "true";
  const ideVmsNoteEnabled = rootEl.getAttribute("data-ide-vms-note-enabled") === "true";

  const [tabs, setTabs] = useState([]);
  const [objectGraph, setObjectGraph] = useState({});
  const [collapsedObjects, setCollapsedObjects] = useState({});
  const [propertyGraph, setPropertyGraph] = useState({});
  const [collapsedProperties, setCollapsedProperties] = useState({});
  const [propertyObjectMeta, setPropertyObjectMeta] = useState({});
  const [active, setActive] = useState(null);
  const [darkMode, setDarkMode] = useState(localStorage.getItem("ide-dark") === "true");
  const [orientation, setOrientation] = useState(localStorage.getItem("ide-orientation") || "top");
  const [vimMode, setVimMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [vmsPrompt, setVmsPrompt] = useState(EMPTY_VMS_PROMPT_STATE);
  const [editorFont, setEditorFont] = useState(getPreferredFont());
  const [wordWrap, setWordWrap] = useState(false);
  const [hoverOverlay, setHoverOverlay] = useState(null);
  const editors = useRef({});
  const recentTabIds = useRef([]);
  const overlayCache = useRef({ verb: new Map(), prop: new Map() });
  const pendingOverlayKey = useRef("");
  const vmsPromptInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    return () => document.documentElement.classList.remove("dark");
  }, [darkMode]);

  useEffect(() => {
    document.body.classList.add("ide-editor");
    return () => document.body.classList.remove("ide-editor");
  }, []);

  useEffect(() => {
    if (!active) return;
    recentTabIds.current = [...recentTabIds.current.filter((id) => id !== active), active];
  }, [active]);


  const buildTitle = (editor) => {
    if (editor.editorName) return editor.editorName;
    if (editor.obj && (editor.verb || editor.prop || editor.property)) {
      return `${editor.obj}:${editor.verb || editor.prop || editor.property}`;
    }
    return editor.uploadCommand || "Untitled";
  };

  const getPrimaryAlias = (verbName) => String(verbName || "").trim().split(/\s+/)[0] || "";
  const getPrimaryProperty = (propertyName) => String(propertyName || "").trim().split(/\s+/)[0] || "";

  const sortByLabel = (items) =>
    [...items].sort((a, b) =>
      getPrimaryAlias(a.verbName).localeCompare(
        getPrimaryAlias(b.verbName),
        undefined,
        { sensitivity: "base" }
      )
    );

  const sortByPropertyLabel = (items) =>
    [...items].sort((a, b) =>
      getPrimaryProperty(a.propertyName).localeCompare(
        getPrimaryProperty(b.propertyName),
        undefined,
        { sensitivity: "base" }
      )
    );

  const parseObjectPropertyTarget = (target) => {
    const value = String(target || "").trim();
    const dotAt = value.indexOf(".");
    if (dotAt <= 0 || dotAt >= value.length - 1) return null;
    const objectId = value.slice(0, dotAt).trim();
    const propertyName = value.slice(dotAt + 1).trim();
    if (!objectId || !propertyName) return null;
    return { objectId, propertyName };
  };

  const getDefinitionTargetAtPosition = (line, column) => {
    if (typeof line !== "string") return "";
    const pattern = /(#\d+(?::[A-Za-z0-9_@*.-]+|\.[A-Za-z0-9_]+)|\$[A-Za-z0-9_]+(?::[A-Za-z0-9_@*.-]+|\.[A-Za-z0-9_]+)|this(?::[A-Za-z0-9_@*.-]+|\.[A-Za-z0-9_]+))(?:\(\))?/g;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const full = match[0];
      const target = match[1];
      const start = match.index;
      const end = start + full.length;
      if (column >= start && column <= end) {
        return target;
      }
    }
    return "";
  };

  const splitReferenceTarget = (target) => {
    const raw = String(target || "").trim();
    if (!raw) return null;
    const separator = raw.includes(":") ? ":" : raw.includes(".") ? "." : "";
    if (!separator) return null;
    const idx = raw.indexOf(separator);
    if (idx <= 0 || idx >= raw.length - 1) return null;
    return {
      kind: separator === ":" ? "verb" : "prop",
      objectId: raw.slice(0, idx),
      itemName: raw.slice(idx + 1),
    };
  };

  const getEditingObjectId = (command, commandTarget) => {
    const target = String(commandTarget || "").trim();
    if (!target) return "";
    if (command === "@program") {
      const idx = target.indexOf(":");
      if (idx > 0) return target.slice(0, idx).trim();
    }
    if (PROPERTY_EDIT_COMMANDS.has(command)) {
      const idx = target.indexOf(".");
      if (idx > 0) return target.slice(0, idx).trim();
    }
    const match = target.match(/^(#\d+)/);
    return match ? match[1] : "";
  };

  const resolveThisReference = (target, editingObjectId) => {
    const raw = String(target || "").trim();
    if (!raw) return "";
    if (!raw.startsWith("this:") && !raw.startsWith("this.")) return raw;
    if (!editingObjectId) return "";
    return `${editingObjectId}${raw.slice(4)}`;
  };

  const getOverlayResolvedObjectId = (requestObjectId, payload) => {
    const resolvedObjectId = String(payload?.resolved_object || payload?.resolvedObject || "").trim();
    return resolvedObjectId || String(requestObjectId || "").trim();
  };

  const getOverlayCacheKeys = (requestObjectId, itemName, payload) => {
    const requestObject = String(requestObjectId || "").trim();
    const item = String(itemName || "").trim();
    if (!requestObject || !item) return [];
    const resolvedObject = getOverlayResolvedObjectId(requestObject, payload);
    const keys = [`${requestObject}::${item}`];
    if (resolvedObject && resolvedObject !== requestObject) {
      keys.push(`${resolvedObject}::${item}`);
    }
    return keys;
  };

  const getOverlayDisplayObjectId = (overlay) => {
    if (!overlay) return "";
    return getOverlayResolvedObjectId(overlay.objectId, overlay.payload);
  };
  const formatOverlayValue = (payload) => {
    const value = payload?.value;
    if (Array.isArray(value)) {
      return value.map((line) => String(line ?? "")).join("\n");
    }
    if (typeof value === "string") return value;
    if (value == null) return "";
    return String(value);
  };

  const isEnabledFlag = (value) =>
    value === 1 || value === true || String(value).trim() === "1" || String(value).toLowerCase() === "true";

  const formatObjectPermissions = (flags) => {
    if (!flags || typeof flags !== "object") return "";
    let base = "";
    if (isEnabledFlag(flags.r)) base += "r";
    if (isEnabledFlag(flags.w)) base += "w";
    if (isEnabledFlag(flags.f)) base += "f";
    const parts = [];
    if (base) parts.push(`+${base}`);
    if (isEnabledFlag(flags.wiz) || isEnabledFlag(flags.wizard)) parts.push("+wiz");
    if (isEnabledFlag(flags.prog) || isEnabledFlag(flags.programmer)) parts.push("+prog");
    if (isEnabledFlag(flags.player)) parts.push("+player");
    return parts.join("");
  };

  const upsertObjectVerb = (objectId, verbLabel) => {
    setObjectGraph((prev) => {
      const current = prev[objectId] || [];
      if (current.some((entry) => entry.verbName === verbLabel)) return prev;
      if (!Object.prototype.hasOwnProperty.call(prev, objectId)) {
        setCollapsedObjects((state) =>
          Object.prototype.hasOwnProperty.call(state, objectId)
            ? state
            : { ...state, [objectId]: true }
        );
      }
      return {
        ...prev,
        [objectId]: sortByLabel([
          ...current,
          { verbName: verbLabel, permissions: "", argumentsText: "" }
        ])
      };
    });
  };

  const replaceObjectVerbs = (objectId, verbRows) => {
    const dedupedMap = new Map();
    verbRows.forEach((row) => {
      if (!row.verbName) return;
      dedupedMap.set(row.verbName, row);
    });
    const deduped = Array.from(dedupedMap.values());
    setCollapsedObjects((state) =>
      Object.prototype.hasOwnProperty.call(state, objectId)
        ? state
        : { ...state, [objectId]: true }
    );
    setObjectGraph((prev) => ({ ...prev, [objectId]: sortByLabel(deduped) }));
  };

  const upsertObjectProperty = (objectId, propertyLabel) => {
    setPropertyGraph((prev) => {
      const current = prev[objectId] || [];
      if (current.some((entry) => entry.propertyName === propertyLabel)) return prev;
      if (!Object.prototype.hasOwnProperty.call(prev, objectId)) {
        setCollapsedProperties((state) =>
          Object.prototype.hasOwnProperty.call(state, objectId)
            ? state
            : { ...state, [objectId]: true }
        );
      }
      return {
        ...prev,
        [objectId]: sortByPropertyLabel([
          ...current,
          { propertyName: propertyLabel, clear: false }
        ])
      };
    });
  };

  const replaceObjectProperties = (objectId, propertyRows, objectMeta) => {
    const dedupedMap = new Map();
    propertyRows.forEach((row) => {
      if (!row.propertyName) return;
      dedupedMap.set(row.propertyName, row);
    });
    const deduped = Array.from(dedupedMap.values());
    setCollapsedProperties((state) =>
      Object.prototype.hasOwnProperty.call(state, objectId)
        ? state
        : { ...state, [objectId]: true }
    );
    setPropertyGraph((prev) => ({ ...prev, [objectId]: sortByPropertyLabel(deduped) }));
    if (objectMeta && typeof objectMeta === "object") {
      setPropertyObjectMeta((prev) => ({ ...prev, [objectId]: objectMeta }));
    }
  };

  const applyObjectVerbsPayload = (payload) => {
    if (!payload) return;

    if (Array.isArray(payload) && payload.length >= 2) {
      const objectId = String(payload[0] || "").trim();
      const rows = Array.isArray(payload[1]) ? payload[1] : [];
      if (!objectId) return;
      const formatted = rows
        .map((row) => {
          if (!Array.isArray(row)) return "";
          const permissions = String(row[1] || "").trim();
          const verbName = String(row[2] || "").trim();
          const argGroups = Array.isArray(row[3]) ? row[3] : [];
          const argumentsText = argGroups
            .map((group) => (Array.isArray(group) ? group.map((x) => String(x)).join(" ") : String(group)))
            .join(" | ")
            .trim();
          if (!verbName) return "";
          return { verbName, permissions, argumentsText, owner: "", lastUpdated: "" };
        })
        .filter(Boolean);
      replaceObjectVerbs(objectId, formatted);
      return;
    }

    if (typeof payload !== "object") return;
    const objectId = String(payload.object || payload.id || "").trim();
    if (!objectId) return;
    const verbsObj = payload.verbs && typeof payload.verbs === "object" ? payload.verbs : {};
    const formatted = Object.values(verbsObj)
      .map((verb) => {
        if (!verb || typeof verb !== "object") return "";
        const verbName = String(verb.name || "").trim();
        if (!verbName) return "";
        const args = Array.isArray(verb.args) ? verb.args.map((x) => String(x)).join(" ") : String(verb.args || "").trim();
        return {
          verbName,
          argumentsText: args,
          owner: String(verb.owner || "").trim(),
          permissions: String(verb.permissions || "").trim(),
          lastUpdated: String(verb["last updated"] || verb.lastUpdated || "").trim()
        };
      })
      .filter(Boolean);
    replaceObjectVerbs(objectId, formatted);
  };

  const applyObjectPropsPayload = (payload) => {
    if (!payload) return;

    if (Array.isArray(payload) && payload.length >= 2) {
      const objectId = String(payload[0] || "").trim();
      const rows = Array.isArray(payload[1]) ? payload[1] : [];
      if (!objectId) return;
      const formatted = rows
        .map((row) => {
          if (Array.isArray(row)) {
            const rawName = [row[1], row[2], row[0]].find((part) => String(part || "").trim()) || "";
            const propertyName = String(rawName || "").trim();
            if (!propertyName || propertyName === objectId) return "";
            return { propertyName, clear: false, owner: "", permissions: "" };
          }
          const propertyName = String(row || "").trim();
          if (!propertyName) return "";
          return { propertyName, clear: false, owner: "", permissions: "" };
        })
        .filter(Boolean);
      replaceObjectProperties(objectId, formatted);
      return;
    }

    if (typeof payload !== "object") return;
    const objectId = String(payload.object || payload.id || "").trim();
    if (!objectId) return;
    const props = payload.props && typeof payload.props === "object" ? payload.props : {};
    const formatted = Object.entries(props)
      .map(([propertyName, propData]) => {
        const name = String(propertyName || "").trim();
        if (!name) return "";
        return {
          propertyName: name,
          clear: Number(propData?.clear) === 1,
          owner: String(propData?.owner || "").trim(),
          permissions: String(propData?.permissions || "").trim()
        };
      })
      .filter(Boolean);
    replaceObjectProperties(objectId, formatted, {
      name: String(payload.name || "").trim(),
      owner: String(payload.owner || "").trim(),
      parent: String(payload.parent || "").trim(),
      flags: payload.flags && typeof payload.flags === "object" ? payload.flags : {}
    });
  };

  const addTab = (editor) => {
    setHoverOverlay(null);
    pendingOverlayKey.current = "";
    const title = buildTitle(editor);
    const { command, commandTarget } = parseCommand(editor.uploadCommand || "");
    const name = editor.name || `${editor.editorName || ""}|${commandTarget || ""}`;
    const isProgramCommand = command === "@program";
    const isEditVerbTarget = command === "@edit" && commandTarget.includes(":");
    const isEditPropTarget = command === "@edit" && commandTarget.includes(".") && !commandTarget.includes(":");
    const isVerbContext = isProgramCommand || isEditVerbTarget;
    const isPropertyContext = PROPERTY_EDIT_COMMANDS.has(command) || isEditPropTarget;

    if (isVerbContext) {
      const splitAt = commandTarget.indexOf(":");
      if (splitAt > 0 && splitAt < commandTarget.length - 1) {
        const objectId = commandTarget.slice(0, splitAt).trim();
        const verbName = commandTarget.slice(splitAt + 1).trim();
        if (objectId && verbName) {
          upsertObjectVerb(objectId, verbName);
        }
      }
    } else if (isPropertyContext) {
      const parsedTarget = parseObjectPropertyTarget(commandTarget);
      if (parsedTarget) {
        upsertObjectProperty(parsedTarget.objectId, parsedTarget.propertyName);
      }
    }

    const pinBrowserTabs = (list) => {
      const objectBrowser = list.find((tab) => tab.tabType === "object-browser");
      const propertyBrowser = list.find((tab) => tab.tabType === "property-browser");
      const otherTabs = list.filter((tab) => tab.tabType !== "object-browser" && tab.tabType !== "property-browser");
      const pinned = [];
      if (objectBrowser) pinned.push(objectBrowser);
      if (propertyBrowser) pinned.push(propertyBrowser);
      return [...pinned, ...otherTabs];
    };

    setTabs((prev) => {
      const existing = prev.find((t) => t.name === name);
      if (existing) {
        setActive(existing.id);
        const socket = getSocket();
        socket?.emit(
          "input",
          "@@editor-message There was already a tab with that information open so we have switched the view to that. We did not update the contents."
        );
        return pinBrowserTabs(prev);
      }
      const id = Date.now() + Math.random();
      setActive(id);
      const nextTab = {
        id,
        name,
        title,
        uploadCommand: editor.uploadCommand || "none",
        editorName: editor.editorName || "",
        command,
        commandTarget,
        content: editor.buffer || "",
        savedContent: editor.buffer || "",
        dirty: false,
        vmsNote: isProgramCommand ? "" : null,
      };
      const tabsToAdd = [];
      const hasObjectBrowser = prev.some((t) => t.name === "object-browser");
      const hasPropertyBrowser = prev.some((t) => t.name === "property-browser");

      if (isVerbContext && !hasObjectBrowser) {
        tabsToAdd.push({
          id: Date.now() + Math.random(),
          name: "object-browser",
          title: "Object Browser",
          uploadCommand: "none",
          editorName: "Object Browser",
          command: "",
          commandTarget: "none",
          content: "",
          savedContent: "",
          dirty: false,
          tabType: "object-browser",
        });
      }

      if (isPropertyContext && !hasPropertyBrowser) {
        tabsToAdd.push({
          id: Date.now() + Math.random(),
          name: "property-browser",
          title: "Property Browser",
          uploadCommand: "none",
          editorName: "Property Browser",
          command: "",
          commandTarget: "none",
          content: "",
          savedContent: "",
          dirty: false,
          tabType: "property-browser",
        });
      }

      return pinBrowserTabs([...prev, ...tabsToAdd, nextTab]);
    });
  };

  const addScratch = () => {
    const title = "Temporary Scratch Pad";
    addTab({
      editorName: title,
      name: `${title} ${Date.now()}`,
      uploadCommand: `@scratch ${title}`,
    });
  };

  const viewSavedScratch = () => {
    const socket = getSocket();
    socket.emit("input", "@edit me.scratch");
  };

  useEffect(() => {
    const msg = (e) => {
      if (e.data && e.data.type === "ide-open-tab") {
        addTab(e.data.editor);
      } else if (e.data && e.data.type === "ide-object-verbs") {
        applyObjectVerbsPayload(e.data.payload);
      } else if (e.data && e.data.type === "ide-object-props") {
        applyObjectPropsPayload(e.data.payload);
      } else if (e.data && e.data.type === "ide-verb-overlay") {
        const objectId = String(e.data.objectId || "").trim();
        const itemName = String(e.data.verbName || "").trim();
        if (!objectId || !itemName) return;
        console.log("[SDWC overlay response][ide-editor][verb]", { objectId, itemName, payload: e.data.payload });
        const keys = getOverlayCacheKeys(objectId, itemName, e.data.payload);
        keys.forEach((key) => overlayCache.current.verb.set(key, e.data.payload ?? {}));
        setHoverOverlay((state) =>
          state && state.kind === "verb" && state.objectId === objectId && state.itemName === itemName
            ? { ...state, loading: false, payload: e.data.payload ?? {} }
            : state
        );
      } else if (e.data && e.data.type === "ide-prop-overlay") {
        const objectId = String(e.data.objectId || "").trim();
        const itemName = String(e.data.propertyName || "").trim();
        if (!objectId || !itemName) return;
        console.log("[SDWC overlay response][ide-editor][prop]", { objectId, itemName, payload: e.data.payload });
        const keys = getOverlayCacheKeys(objectId, itemName, e.data.payload);
        keys.forEach((key) => overlayCache.current.prop.set(key, e.data.payload ?? {}));
        setHoverOverlay((state) =>
          state && state.kind === "prop" && state.objectId === objectId && state.itemName === itemName
            ? { ...state, loading: false, payload: e.data.payload ?? {} }
            : state
        );
      }
    };
    window.addEventListener("message", msg);
    window.opener?.postMessage({ type: "ide-ready" }, "*");
    return () => window.removeEventListener("message", msg);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.data && (e.data.type === "ide-set-font" || e.data.type === "set-editor-font")) {
        setEditorFont(e.data.font);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (tabs.some((t) => t.dirty)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [tabs]);

  // Ensure Ace resizes when orientation changes or active tab switches
  useEffect(() => {
    const id = setTimeout(() => editors.current[active]?.resize(), 0);
    return () => clearTimeout(id);
  }, [orientation, active]);

  // NEW: Resize Ace when the window size changes (so left dock % width changes are reflected)
  useEffect(() => {
    const onWinResize = () => {
      // Give layout a beat to settle, then resize
      requestAnimationFrame(() => editors.current[active]?.resize());
    };
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, [active]);

  useEffect(() => {
    Object.values(editors.current).forEach((ed) => {
      ed.setKeyboardHandler(vimMode ? "ace/keyboard/vim" : "");
    });
  }, [vimMode]);

  useEffect(() => {
    const family = getFontFamily(editorFont);
    Object.values(editors.current).forEach((ed) => {
      ed.setOption("fontFamily", family);
    });
  }, [editorFont]);

  const toggleWordWrap = () => {
    setWordWrap((w) => !w);
  };

  useEffect(() => {
    Object.values(editors.current).forEach((ed) => {
      const session = ed.getSession();
      session.setUseWrapMode(wordWrap);
      ed.setOption("wrap", wordWrap ? "free" : "off");
      ed.renderer.updateFull();
    });
  }, [wordWrap]);

  useEffect(() => {
    document.title = `Dome-Client Developer IDE [${tabs.length}]`;
  }, [tabs.length]);

  const setEditorRef = (id, node, content, command, commandTarget = "") => {
    if (node && !editors.current[id]) {
      const ed = ace.edit(node);
      const isProgram = command === "@program";
      const editingObjectId = getEditingObjectId(command, commandTarget);
      const isLocalSaveNode = command === "@local-save-node";
      const isLocalSaveNodeAdmin = command === "@local-save-node-admin";
      const isLocalSaveNote = command === "@local-save-note";
      let lineLimit = null;
      if (isLocalSaveNode) {
        lineLimit = localSaveNodeMaxLines;
      } else if (isLocalSaveNodeAdmin) {
        lineLimit = localSaveNodeAdminMaxLines;
      } else if (isLocalSaveNote) {
        lineLimit = localSaveNoteMaxLines;
      }
      if (editorTheme) ed.setTheme(`ace/theme/${editorTheme}`);
      ed.getSession().setMode(isProgram ? "ace/mode/moo" : "ace/mode/text");
      if (vimMode) ed.setKeyboardHandler("ace/keyboard/vim");
      ed.setOption("fontFamily", getFontFamily(editorFont));
      ed.setOption("printMarginColumn", 120);
      const session = ed.getSession();
      session.setUseWrapMode(wordWrap);
      ed.setOption("wrap", wordWrap ? "free" : "off");
      ed.renderer.updateFull();
      ed.setValue(content, -1);
      ed.on("change", () => {
        if (lineLimit) {
          const session = ed.getSession();
          const lineCount = session.getLength();
          if (lineCount > lineLimit) {
            const cursor = ed.getCursorPosition();
            ed.undo();
            ed.moveCursorTo(
              Math.min(cursor.row, lineLimit - 1),
              cursor.column
            );
            ed.clearSelection();
            return;
          }
        }
        const val = ed.getValue();
        setTabs((ts) =>
          ts.map((t) =>
            t.id === id ? { ...t, content: val, dirty: val !== t.savedContent } : t
          )
        );
      });
      ed.on("click", (event) => {
        if (!isProgram) return;
        const domEvent = event?.domEvent;
        if (!domEvent || !(domEvent.metaKey || domEvent.ctrlKey)) return;
        const pos = event?.getDocumentPosition?.();
        if (!pos) return;
        const line = ed.getSession()?.getLine?.(pos.row) || "";
        const target = resolveThisReference(getDefinitionTargetAtPosition(line, pos.column), editingObjectId);
        if (!target) return;
        domEvent.preventDefault?.();
        domEvent.stopPropagation?.();
        const socket = getSocket();
        const openParentSuffix = ideEditOpenParent && target.includes(":") ? " --open-parent" : "";
        socket?.emit("input", `@edit ${target}${openParentSuffix}`);
      });
      ed.on("mousemove", (event) => {
        const pos = event?.getDocumentPosition?.();
        const domEvent = event?.domEvent;
        if (!pos || !domEvent) return;
        const line = ed.getSession()?.getLine?.(pos.row) || "";
        const target = resolveThisReference(getDefinitionTargetAtPosition(line, pos.column), editingObjectId);
        const parsed = splitReferenceTarget(target);
        if (!parsed) {
          setHoverOverlay((state) => (state && state.tabId === id ? null : state));
          pendingOverlayKey.current = "";
          return;
        }
        const key = `${parsed.objectId}::${parsed.itemName}`;
        const cached = overlayCache.current[parsed.kind].get(key);
        setHoverOverlay({
          tabId: id,
          kind: parsed.kind,
          objectId: parsed.objectId,
          itemName: parsed.itemName,
          x: (domEvent.clientX || 0) + 12,
          y: (domEvent.clientY || 0) + 12,
          loading: !cached,
          payload: cached || null
        });
        if (cached) {
          console.log("[SDWC overlay cache hit][ide-editor]", { kind: parsed.kind, key });
          return;
        }
        if (pendingOverlayKey.current === `${parsed.kind}:${key}`) return;
        pendingOverlayKey.current = `${parsed.kind}:${key}`;
        const socket = getSocket();
        if (!socket) return;
        const cmd = parsed.kind === "verb"
          ? `#$# SDWC%%VERB-OVERLAY%%${parsed.objectId}%%${parsed.itemName}`
          : `#$# SDWC%%PROP-OVERLAY%%${parsed.objectId}%%${parsed.itemName}`;
        console.log("[SDWC overlay request][ide-editor]", { cmd });
        socket.emit("input", cmd);
      });
      ed.on("mouseout", () => {
        setHoverOverlay((state) => (state && state.tabId === id ? null : state));
        pendingOverlayKey.current = "";
      });
      editors.current[id] = ed;
    }
  };

  const onSave = () => {
    const tab = tabs.find((t) => t.id === active);
    if (!tab || !tab.commandTarget || tab.commandTarget === "none") return;
    if (ideVmsNoteEnabled && tab.command === "@program" && String(tab.vmsNote || "").trim() === "") {
      setVmsPrompt({ open: true, tabId: tab.id, value: tab.vmsNote || "" });
      return;
    }
    const shouldSendVmsLine = ideVmsNoteEnabled && tab.command === "@program";
    const vmsNote = shouldSendVmsLine ? String(tab.vmsNote || "") : "";
    const didSave = runSave(tab, shouldSendVmsLine ? vmsNote : null);
    if (didSave && ideVmsNoteEnabled && vmsPrompt.open) {
      setVmsPrompt(EMPTY_VMS_PROMPT_STATE);
    }
  };

  const runSave = (tab, vmsNoteLine = null) => {
    const socket = getSocket();
    const ed = editors.current[tab.id];
    if (!socket || !ed) return false;
    const val = ed.getValue();
    socket.emit("input", tab.uploadCommand);
    socket.emit("input", val + "\n.");
    if (typeof vmsNoteLine === "string" && vmsNoteLine.trim() !== "") {
      socket.emit("input", vmsNoteLine);
    }
    setTabs((ts) => ts.map((t) => (t.id === tab.id ? { ...t, savedContent: val, dirty: false } : t)));
    return true;
  };

  const cancelVmsPrompt = () => {
    setVmsPrompt(EMPTY_VMS_PROMPT_STATE);
  };

  const submitVmsPrompt = () => {
    if (!vmsPrompt.open || vmsPrompt.tabId == null) return;
    const targetTab = tabs.find((t) => t.id === vmsPrompt.tabId);
    if (!targetTab) {
      setVmsPrompt(EMPTY_VMS_PROMPT_STATE);
      return;
    }
    const nextNote = vmsPrompt.value || "";
    const didSave = runSave({ ...targetTab, vmsNote: nextNote }, nextNote);
    if (!didSave) return;
    setTabs((ts) => ts.map((t) => (t.id === targetTab.id ? { ...t, vmsNote: nextNote } : t)));
    setVmsPrompt(EMPTY_VMS_PROMPT_STATE);
  };

  const onLoadVerbs = (objectId) => {
    setCollapsedObjects((prev) => ({ ...prev, [objectId]: false }));
    const socket = getSocket();
    if (!socket) return;
    socket.emit("input", `#$# SDWC%%VERBS%%${objectId}`);
  };

  const onLoadProps = (objectId) => {
    setCollapsedProperties((prev) => ({ ...prev, [objectId]: false }));
    const socket = getSocket();
    if (!socket) return;
    socket.emit("input", `#$# SDWC%%PROPS%%${objectId}`);
  };

  const onEditVerb = (objectId, rawVerbName) => {
    const firstAlias = String(rawVerbName || "").trim().split(/\s+/)[0] || "";
    const verbName = firstAlias.includes("*")
      ? firstAlias.slice(0, firstAlias.indexOf("*")).trim()
      : firstAlias;
    if (!verbName) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit("input", `@edit ${objectId}:${verbName}`);
  };

  const onEditProperty = (objectId, rawPropertyName) => {
    const propertyName = String(rawPropertyName || "").trim().split(/\s+/)[0] || "";
    if (!propertyName) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit("input", `@edit ${objectId}.${propertyName}`);
  };

  const toggleObjectCollapsed = (objectId) => {
    setCollapsedObjects((prev) => ({ ...prev, [objectId]: !prev[objectId] }));
  };

  const togglePropertyCollapsed = (objectId) => {
    setCollapsedProperties((prev) => ({ ...prev, [objectId]: !prev[objectId] }));
  };

  const closeTab = (id) => {
    editors.current[id]?.destroy();
    delete editors.current[id];
    setTabs((ts) => {
      const next = ts.filter((t) => t.id !== id);
      recentTabIds.current = recentTabIds.current.filter((tabId) => tabId !== id);
      if (active === id) {
        const fallbackId = [...recentTabIds.current].reverse().find((tabId) => next.some((t) => t.id === tabId));
        setActive(fallbackId || next[0]?.id || null);
      }
      if (next.length === 0) {
        setTimeout(() => window.close(), 0);
      }
      return next;
    });
  };

  const onClose = (id) => {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    if (!t.dirty || window.confirm("Tab has unsaved changes. Close anyway?")) {
      closeTab(id);
    }
  };

  useEffect(() => {
    if (!ideVmsNoteEnabled) return;
    if (!vmsPrompt.open) return;
    const id = setTimeout(() => vmsPromptInputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [ideVmsNoteEnabled, vmsPrompt.open]);

  useEffect(() => {
    const handler = (e) => {
      if (ideVmsNoteEnabled && vmsPrompt.open) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelVmsPrompt();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          submitVmsPrompt();
          return;
        }
      }

      if (e.key === "Escape" && showShortcuts) {
        setShowShortcuts(false);
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "/") {
        const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
        if ((isMac && e.metaKey) || (!isMac && e.ctrlKey)) {
          e.preventDefault();
          setShowShortcuts((s) => !s);
        }
        return;
      }

      if (!(e.ctrlKey || e.metaKey)) return;

      if (key === "s") {
        e.preventDefault();
        const t = tabs.find((tab) => tab.id === active);
        if (t?.commandTarget && t.commandTarget !== "none") {
          onSave();
        }
      } else if (key === "e" && !e.shiftKey) {
        e.preventDefault();
        if (active !== null) {
          onClose(active);
        } else {
          window.close();
        }
      } else if (key === "1") {
        e.preventDefault();
        setVimMode(true);
      } else if (key === "0") {
        e.preventDefault();
        setVimMode(false);
      } else if (key === "[") {
        e.preventDefault();
        if (tabs.length) {
          const idx = tabs.findIndex((t) => t.id === active);
          const next = tabs[(idx - 1 + tabs.length) % tabs.length];
          setActive(next.id);
        }
      } else if (key === "]") {
        e.preventDefault();
        if (tabs.length) {
          const idx = tabs.findIndex((t) => t.id === active);
          const next = tabs[(idx + 1) % tabs.length];
          setActive(next.id);
        }
      } else if (key === "l" && e.shiftKey) {
        e.preventDefault();
        toggleWordWrap();
      } else if (key === "x" && e.shiftKey) {
        e.preventDefault();
        setOrientationPersist(orientation === "top" ? "left" : "top");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onSave, onClose, tabs, showShortcuts, orientation, toggleWordWrap, ideVmsNoteEnabled, vmsPrompt]);

  const toggleTheme = () => {
    const m = !darkMode;
    setDarkMode(m);
    localStorage.setItem("ide-dark", String(m));
  };

  const setOrientationPersist = (o) => {
    setOrientation(o);
    localStorage.setItem("ide-orientation", o);
    setTimeout(() => editors.current[active]?.resize(), 0);
  };

  const activeTab = tabs.find((t) => t.id === active);
  const inputLabel = getCommandLabel(activeTab?.uploadCommand, activeTab?.editorName);
  const browserTabTitleByType = {
    "object-browser": "Object Browser",
    "property-browser": "Property Browser"
  };
  const isBrowserActive = Object.prototype.hasOwnProperty.call(browserTabTitleByType, activeTab?.tabType || "");
  const editingLabel = isBrowserActive
    ? browserTabTitleByType[activeTab.tabType]
    : `${vimMode ? "VIM Editing" : "Normal Editing"}${inputLabel ? ` | ${inputLabel}` : ""}`;

  return (
    <div className="h-dvh w-dvw bg-bg-canvas text-ink">
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-bg-surface text-ink rounded-lg shadow-card p-6 w-fit max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-3xl font-semibold mb-4">Editor Shortcuts</h2>
            <table className="text-left border-collapse table-auto whitespace-nowrap">
              <thead>
                <tr className="text-2xl text-ink-muted">
                  <th className="px-4 pb-2">Action</th>
                  <th className="px-4 pb-2">macOS</th>
                  <th className="px-4 pb-2">Windows/Linux</th>
                </tr>
              </thead>
              <tbody className="text-2xl">
                <tr>
                  <td className="py-1 px-4">Save tab</td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">⌘ S</kbd></td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl S</kbd></td>
                </tr>
                <tr>
                  <td className="py-1 px-4">Close tab</td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">⌘ E</kbd></td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl E</kbd></td>
                </tr>
                <tr>
                  <td className="py-1 px-4">Enable VIM mode</td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">⌘ 1</kbd></td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl 1</kbd></td>
                </tr>
                <tr>
                  <td className="py-1 px-4">Disable VIM mode</td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">⌘ 0</kbd></td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl 0</kbd></td>
                </tr>
                <tr>
                  <td className="py-1 px-4">Previous tab</td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">⌘ [</kbd></td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl [</kbd></td>
                </tr>
                <tr>
                  <td className="py-1 px-4">Next tab</td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">⌘ ]</kbd></td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl ]</kbd></td>
                </tr>
                <tr>
                  <td className="py-1 px-4">Toggle word wrap</td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl Shift L</kbd></td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl Shift L</kbd></td>
                </tr>
                <tr>
                  <td className="py-1 px-4">Toggle tab alignment</td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">⌘ ⇧ X</kbd></td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl Shift X</kbd></td>
                </tr>
                <tr>
                  <td className="py-1 px-4">Toggle shortcuts overlay</td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">⌘ /</kbd></td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl /</kbd></td>
                </tr>
                <tr>
                  <td className="py-1 px-4">Edit Verb / Prop</td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">⌘ Click ref</kbd></td>
                  <td className="py-1 px-4"><kbd className="px-2 py-1 border rounded text-2xl">Ctrl Click ref</kbd></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="h-full w-full p-1">
        <div className="h-full w-full mx-auto rounded-xl bg-bg-surface shadow-card border border-line-subtle overflow-hidden flex flex-col">

          {/* Status/controls row — ORDER: Orientation | Theme | (center) Editing Mode | Status | Save */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-line-subtle bg-bg-surface">
            {/* LEFT: Orientation control */}
            <div
              className="inline-flex shrink-0 rounded-md overflow-hidden border border-line-subtle bg-bg-sunken"
              role="group"
              aria-label="Tab orientation"
            >
              <button
                onClick={() => setOrientationPersist("top")}
                aria-pressed={orientation === "top"}
                className={`px-4 py-2 text-base ${
                  orientation === "top"
                    ? "bg-bg-surface text-ink"
                    : "text-ink-muted hover:text-ink hover:bg-bg-surface"
                }`}
              >
                Top
              </button>
              <button
                onClick={() => setOrientationPersist("left")}
                aria-pressed={orientation === "left"}
                className={`px-4 py-2 text-base ${
                  orientation === "left"
                    ? "bg-bg-surface text-ink"
                    : "text-ink-muted hover:text-ink hover:bg-bg-surface"
                }`}
              >
                Left
              </button>
            </div>

            {/* NEXT: Theme toggle */}
            <button
              onClick={toggleTheme}
              className="px-4 py-2 text-base rounded-md border border-line-subtle bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Toggle theme"
            >
              {darkMode ? "Light" : "Dark"}
            </button>

            {/* Word wrap toggle */}
            <button
              onClick={toggleWordWrap}
              className={`px-4 py-2 text-base rounded-md border bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                wordWrap ? "border-brand-500 ring-1 ring-brand-500/40" : "border-line-subtle"
              }`}
              title="Toggle word wrap for all tabs (Ctrl Shift L)"
            >
              Wrap
            </button>

            {/* Shortcuts overlay toggle */}
            <button
              onClick={() => setShowShortcuts(true)}
              className="px-4 py-2 text-base rounded-md border border-line-subtle bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Show editor shortcuts (⌘/Ctrl+/)"
            >
              Shortcuts
            </button>

            {/* Add Scratch tab */}
            <button
              onClick={addScratch}
              className="px-4 py-2 text-base rounded-md border border-line-subtle bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="Add temporary scratch pad"
            >
              Add Scratch
            </button>

            {/* View Saved Scratch */}
            <button
              onClick={viewSavedScratch}
              className="px-4 py-2 text-base rounded-md border border-line-subtle bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              title="View saved scratch pad"
            >
              View Saved Scratch
            </button>

            {/* CENTER: Editing mode */}
            <div className="flex-1 text-center text-lg text-ink-muted truncate">{editingLabel}</div>

            {/* RIGHT: Status then Save */}
            <div className="flex items-center gap-3">
              {!isBrowserActive && (
                <div className="flex items-center gap-2 text-lg">
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      activeTab?.dirty ? "text-warn-500" : "text-ok-500"
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        activeTab?.dirty ? "bg-warn-500" : "bg-ok-500"
                      }`}
                    />
                    {activeTab?.dirty ? "Unsaved changes" : "Saved"}
                  </span>
                </div>
              )}

              {activeTab?.commandTarget &&
                activeTab.commandTarget !== "none" && (
                <button
                  onClick={onSave}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-ink-invert hover:bg-brand-500 active:translate-y-[0.5px] transition text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                  title="Save active tab (⌘/Ctrl+S)"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 21h14V7l-4-4H5v18Zm3-3h8M9 3v4h6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Save
                </button>
              )}

              <button
                onClick={() => (active !== null ? onClose(active) : window.close())}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 text-ink-invert hover:bg-red-500 active:translate-y-[0.5px] transition text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                title="Close active tab (⌘/Ctrl+E)"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l12 12M6 18L18 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Close
              </button>
            </div>
          </div>

          {/* Tabs & editors */}
          <div className={`flex-1 flex min-h-0 ${orientation === "left" ? "" : "flex-col"}`}>
            <div
              className={`${
                orientation === "left"
                  // ✨ Responsive left dock: grows with viewport, but bounded
                  ? "w-[clamp(14rem,24vw,28rem)] flex-none h-full overflow-y-auto border-r border-line-subtle bg-bg-sunken"
                  : "flex-none whitespace-nowrap overflow-x-auto border-b border-line-subtle bg-bg-sunken -mb-px"
              }`}
              role="tablist"
              aria-orientation={orientation === "left" ? "vertical" : "horizontal"}
            >
              <div className={`flex ${orientation === "left" ? "flex-col" : "items-end gap-2 px-3 py-2"}`}>
                {tabs.map((t) => {
                  const dirty = t.dirty;
                  const isActive = active === t.id;
                  const isProgramTab = t.command === "@program";

                  const baseTab =
                    "relative pr-10 group flex items-center gap-3 px-4 py-3 text-base rounded-md border transition";
                  const activeStyles = "bg-bg-surface shadow-sm border-line-strong";
                  const inactiveStyles = "border-line-subtle hover:bg-bg-sunken";
                  const programOutline = isProgramTab ? "border-b-2 border-b-yellow-300" : "";

                  return orientation === "left" ? (
                    <div
                      key={t.id}
                      role="tab"
                      aria-selected={isActive}
                      tabIndex={isActive ? 0 : -1}
                      className={`${baseTab} ${isActive ? activeStyles : inactiveStyles} ${programOutline}`}
                      onClick={() => setActive(t.id)}
                      title={t.title}
                    >
                      {/* Tooltip (shows on hover anywhere over the tab) */}
                      <div className="absolute left-0 bottom-full mb-1 z-30 hidden group-hover:block pointer-events-none">
                        <div className="px-2 py-1 rounded bg-ink text-ink-invert text-sm shadow-card whitespace-nowrap">
                          {t.title}
                        </div>
                      </div>

                      <svg className="w-5 h-5 text-ink-muted group-hover:text-ink" />
                      <span className="truncate">{t.title}{dirty ? " *" : ""}</span>

                      {/* scalable dirty/saved dot */}
                      {t.tabType !== "object-browser" && t.tabType !== "property-browser" && (
                        <span
                          className={`ml-auto mr-8 inline-block rounded-full w-[0.9em] h-[0.9em] ${
                            dirty ? "bg-warn-500" : "bg-ok-500"
                          }`}
                          aria-hidden="true"
                        />
                      )}

                      {/* Larger close button */}
                      <button
                        className="absolute right-2 top-2 w-7 h-7 flex items-center justify-center rounded hover:bg-bg-sunken text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClose(t.id);
                        }}
                        title="Close tab (⌘/Ctrl+E)"
                        aria-label={`Close ${t.title}`}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div
                      key={t.id}
                      role="tab"
                      aria-selected={isActive}
                      tabIndex={isActive ? 0 : -1}
                      className={`${baseTab} rounded-t-md ${isActive ? activeStyles : inactiveStyles} ${programOutline}`}
                      onClick={() => setActive(t.id)}
                      title={t.title}
                    >
                      {/* Tooltip for top tabs */}
                      <div className="absolute left-0 bottom-full mb-1 z-30 hidden group-hover:block pointer-events-none">
                        <div className="px-2 py-1 rounded bg-ink text-ink-invert text-sm shadow-card whitespace-nowrap">
                          {t.title}
                        </div>
                      </div>

                      <svg className="w-5 h-5 text-ink-muted group-hover:text-ink" />
                      <span className="truncate max-w-[16rem]">{t.title}{dirty ? " *" : ""}</span>

                      {t.tabType !== "object-browser" && t.tabType !== "property-browser" && (
                        <span
                          className={`ml-auto mr-8 inline-block rounded-full w-[0.9em] h-[0.9em] ${
                            dirty ? "bg-warn-500" : "bg-ok-500"
                          }`}
                          aria-hidden="true"
                        />
                      )}

                      <button
                        className="absolute right-2 top-2 w-7 h-7 flex items-center justify-center rounded hover:bg-bg-sunken text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClose(t.id);
                        }}
                        title="Close tab (⌘/Ctrl+E)"
                        aria-label={`Close ${t.title}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 relative bg-bg-surface">
              {tabs.map((t) => (
                <div key={t.id} className={active === t.id ? "absolute inset-0" : "hidden"}>
                  {t.tabType === "object-browser" ? (
                    <div className="object-browser-pane w-full h-full bg-bg-sunken text-ink p-4 overflow-auto">
                      <div className="max-w-7xl">
                        <div className="mb-4">
                          <h2 className="text-xl font-semibold">Object Browser</h2>
                          <p className="text-base text-ink-muted">Loaded objects and verbs for quick navigation.</p>
                        </div>
                      </div>
                      <div className="max-w-7xl">
                        {Object.keys(objectGraph).length === 0 ? (
                          <div className="rounded-md border border-line-subtle bg-bg-surface p-4 text-ink-muted">No objects yet.</div>
                        ) : (
                          Object.entries(objectGraph)
                            .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
                            .map(([objectId, verbs]) => (
                              <section key={objectId} className="mb-4 rounded-md border border-line-subtle bg-bg-surface p-3">
                                {(() => {
                                  const isCollapsed = collapsedObjects[objectId] ?? true;
                                  return (
                                    <>
                                <div className="flex items-center gap-3 mb-1">
                                  <button
                                    type="button"
                                    className="text-ink-muted hover:text-ink font-semibold"
                                    onClick={() => toggleObjectCollapsed(objectId)}
                                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${objectId}`}
                                  >
                                    {isCollapsed ? "[+]" : "[-]"} {objectId}
                                  </button>
                                  <button
                                    type="button"
                                    className="text-sm text-brand-600 hover:text-brand-500 hover:underline"
                                    onClick={() => onLoadVerbs(objectId)}
                                  >
                                    Load Verbs
                                  </button>
                                </div>
                                {!isCollapsed && (
                                  <div className="mt-2 space-y-1 text-lg">
                                    <div className="rounded-sm bg-bg-canvas/40 px-2 py-1 text-sm text-ink-muted">
                                      <div className="grid grid-cols-[minmax(12rem,2fr)_minmax(10rem,2fr)_minmax(8rem,1fr)_minmax(7rem,1fr)_minmax(18rem,3fr)] gap-3 items-start font-semibold">
                                        <span>Verb</span>
                                        <span>Args</span>
                                        <span>Owner</span>
                                        <span>Perms</span>
                                        <span>Last Updated</span>
                                      </div>
                                    </div>
                                    {verbs.map((verb, idx) => {
                                      const aliases = String(verb.verbName || "").trim().split(/\s+/).filter(Boolean);
                                      const primaryAlias = aliases[0] || "";
                                      const extraAliases = aliases.slice(1);
                                      const rowBgClass = idx % 2 === 0
                                        ? "bg-bg-canvas/85"
                                        : "bg-bg-sunken/85 border border-line-subtle/60";
                                      return (
                                        <div key={`${objectId}:${verb.verbName}`} className={`rounded-sm ${rowBgClass} px-2 py-1`}>
                                          <div className="grid grid-cols-[minmax(12rem,2fr)_minmax(10rem,2fr)_minmax(8rem,1fr)_minmax(7rem,1fr)_minmax(18rem,3fr)] gap-3 items-start">
                                            <button
                                              type="button"
                                              className="text-left text-lg text-yellow-300 hover:text-yellow-200 no-underline hover:underline"
                                              onClick={() => onEditVerb(objectId, primaryAlias)}
                                            >
                                              {primaryAlias}
                                            </button>
                                            <span className="text-ink-muted">{verb.argumentsText || "none"}</span>
                                            <span className="text-ink-muted">{verb.owner || "none"}</span>
                                            <span className="text-ink-muted">{verb.permissions || "none"}</span>
                                            <span className="text-ink-muted">{verb.lastUpdated || "none"}</span>
                                          </div>
                                          {extraAliases.map((alias) => (
                                            <div
                                              key={`${objectId}:${verb.verbName}:${alias}`}
                                              className="mt-1 pl-3 text-lg text-yellow-100"
                                            >
                                              ^ {alias}
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                    </>
                                  );
                                })()}
                              </section>
                            ))
                        )}
                      </div>
                    </div>
                  ) : t.tabType === "property-browser" ? (
                    <div className="property-browser-pane w-full h-full bg-bg-sunken text-ink p-4 overflow-auto">
                      <div className="max-w-7xl">
                        <div className="mb-4">
                          <h2 className="text-xl font-semibold">Property Browser</h2>
                          <p className="text-base text-ink-muted">Loaded objects and properties for quick navigation.</p>
                        </div>
                      </div>
                      <div className="max-w-7xl">
                        {Object.keys(propertyGraph).length === 0 ? (
                          <div className="rounded-md border border-line-subtle bg-bg-surface p-4 text-ink-muted">No objects yet.</div>
                        ) : (
                          Object.entries(propertyGraph)
                            .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
                            .map(([objectId, properties]) => (
                              <section key={objectId} className="mb-4 rounded-md border border-line-subtle bg-bg-surface p-3">
                                {(() => {
                                  const isCollapsed = collapsedProperties[objectId] ?? true;
                                  const meta = propertyObjectMeta[objectId] || {};
                                  const permissionsText = formatObjectPermissions(meta.flags) || "none";
                                  const objectLabel = meta.name ? `${meta.name} (${objectId})` : objectId;
                                  const summary = `${objectLabel} | Owner: ${meta.owner || "none"} | Parent: ${meta.parent || "none"} | Permissions: ${permissionsText}`;
                                  return (
                                    <>
                                      <div className="flex items-center gap-3 mb-1">
                                        <button
                                          type="button"
                                          className="text-ink-muted hover:text-ink font-semibold"
                                          onClick={() => togglePropertyCollapsed(objectId)}
                                          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${objectId}`}
                                        >
                                          {isCollapsed ? "[+]" : "[-]"} {summary}
                                        </button>
                                        <button
                                          type="button"
                                          className="text-sm text-brand-600 hover:text-brand-500 hover:underline"
                                          onClick={() => onLoadProps(objectId)}
                                        >
                                          load props
                                        </button>
                                      </div>
                                      {!isCollapsed && (
                                        <div className="mt-2 space-y-1 text-lg">
                                          <div className="rounded-sm bg-bg-canvas/40 px-2 py-1 text-sm text-ink-muted">
                                            <div className="grid grid-cols-[minmax(12rem,2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)] gap-3 items-start font-semibold">
                                              <span>Prop name</span>
                                              <span>Is Clear</span>
                                              <span>Owner</span>
                                              <span>Perms</span>
                                            </div>
                                          </div>
                                          {properties.map((property, idx) => {
                                            const rowBgClass = idx % 2 === 0
                                              ? "bg-bg-canvas/85"
                                              : "bg-bg-sunken/85 border border-line-subtle/60";
                                            return (
                                              <div key={`${objectId}.${property.propertyName}`} className={`rounded-sm ${rowBgClass} px-2 py-1`}>
                                                <div className="grid grid-cols-[minmax(12rem,2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)] gap-3 items-start">
                                                  <button
                                                    type="button"
                                                    className="text-left text-lg text-yellow-300 hover:text-yellow-200 no-underline hover:underline"
                                                    onClick={() => onEditProperty(objectId, property.propertyName)}
                                                  >
                                                    {property.propertyName}
                                                  </button>
                                                  <span className="text-ink-muted">{property.clear ? "clear" : ""}</span>
                                                  <span className="text-ink-muted">{property.owner || ""}</span>
                                                  <span className="text-ink-muted">{property.permissions || ""}</span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </section>
                            ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col">
                      {ideVmsNoteEnabled && t.command === "@program" && String(t.vmsNote || "").trim() !== "" && (
                        <div className="px-4 pt-4 pb-2 border-b border-line-subtle bg-bg-surface">
                          <label className="block text-sm font-medium text-ink-muted mb-1" htmlFor={`vms-note-${t.id}`}>
                            VMS Note
                          </label>
                          <input
                            id={`vms-note-${t.id}`}
                            type="text"
                            value={t.vmsNote || ""}
                            onChange={(e) => {
                              const next = e.target.value;
                              setTabs((ts) => ts.map((tab) => (tab.id === t.id ? { ...tab, vmsNote: next } : tab)));
                            }}
                            className="w-full px-3 py-2 rounded-md border border-line-subtle bg-bg-sunken text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                            placeholder="Enter VMS note"
                            aria-label="VMS note"
                          />
                        </div>
                      )}
                      <div
                        ref={(node) => setEditorRef(t.id, node, t.content, t.command, t.commandTarget)}
                        className="w-full flex-1"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
      {hoverOverlay && (
        <div
          className="sdwc-hover-overlay fixed z-50 min-w-[90ch] max-w-[110ch] rounded-md border border-line-subtle bg-bg-surface/95 shadow-card p-4 text-lg"
          style={{ left: hoverOverlay.x, top: hoverOverlay.y }}
        >
          <div className="font-semibold text-ink mb-2">
            {hoverOverlay.kind === "verb"
              ? `${getOverlayDisplayObjectId(hoverOverlay)}:${hoverOverlay.itemName}`
              : `${getOverlayDisplayObjectId(hoverOverlay)}.${hoverOverlay.itemName}`}
          </div>
          {hoverOverlay.loading ? (
            <div className="text-ink-muted">Loading...</div>
          ) : (
            <pre className="text-base text-ink-muted whitespace-pre-wrap break-words max-h-56 overflow-auto m-0">
              {formatOverlayValue(hoverOverlay.payload)}
            </pre>
          )}
        </div>
      )}
      {ideVmsNoteEnabled && vmsPrompt.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50"
          onClick={cancelVmsPrompt}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="VMS save note prompt"
            className="bg-bg-surface text-ink rounded-lg border border-line-subtle shadow-card p-6 w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-3xl font-semibold mb-2">VMS Save Note</h2>
            <p className="text-lg text-ink-muted mb-4">Add a note for this verb save. Press Enter to submit or Esc to cancel.</p>
            <input
              ref={vmsPromptInputRef}
              type="text"
              value={vmsPrompt.value}
              onChange={(e) => setVmsPrompt((prev) => ({ ...prev, value: e.target.value }))}
              className="w-full px-3 py-2 rounded-md border border-line-subtle bg-bg-sunken text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              placeholder="Optional VMS note"
              aria-label="VMS note prompt input"
            />
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={cancelVmsPrompt}
                className="px-4 py-2 text-base rounded-md border border-line-subtle bg-bg-sunken hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitVmsPrompt}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand-600 text-ink-invert hover:bg-brand-500 active:translate-y-[0.5px] transition text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

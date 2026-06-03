import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefinitionTargetAtPosition,
  getEditingObjectId,
  parseObjectPropertyTarget,
  resolveThisReference,
  splitReferenceTarget
} from "../../src/client/features/editor/react/editor-ide/targets.js";
import {
  formatEditPropertyCommand,
  formatEditVerbCommand,
  formatOpenReferenceCommand,
  formatPropertyListCommand,
  formatPropertyOverlayCommand,
  formatVerbListCommand,
  formatVerbOverlayCommand,
  getSaveMessages
} from "../../src/client/features/editor/react/editor-ide/protocol.js";
import {
  formatObjectPermissions,
  formatOverlayValue,
  getOverlayCacheKeys,
  getOverlayDisplayObjectId,
  normalizeObjectPropertiesPayload,
  normalizeObjectVerbsPayload,
  sortByLabel,
  sortByPropertyLabel
} from "../../src/client/features/editor/react/editor-ide/payloads.js";
import {
  buildIdeTabs,
  buildTitle,
  createEditableTab,
  createObjectBrowserTab,
  createPropertyBrowserTab,
  pinBrowserTabs,
  TAB_TYPES
} from "../../src/client/features/editor/react/editor-ide/tabs.js";
import {
  ideReducer,
  initialIdeState
} from "../../src/client/features/editor/react/editor-ide/state.js";
import {
  buildOpenTabPlan,
  classifyEditorCommand,
  DUPLICATE_TAB_MESSAGE
} from "../../src/client/features/editor/react/editor-ide/openTabPlan.js";
import {
  saveTab,
  shouldPromptForVmsNote
} from "../../src/client/features/editor/react/editor-ide/useIdeSaveFlow.js";
import {
  getAdjacentTabId,
  getShortcutCommand
} from "../../src/client/features/editor/react/editor-ide/useIdeKeyboardShortcuts.js";
import {
  applyOverlayPayload,
  buildOverlayPayloadUpdate
} from "../../src/client/features/editor/react/editor-ide/overlays.js";
import {
  getFallbackTabId,
  getNextActiveTabIdAfterClose
} from "../../src/client/features/editor/react/editor-ide/useRecentTabs.js";
import {
  buildEditingLabel,
  isBrowserActiveTab
} from "../../src/client/features/editor/react/editor-ide/editorLabels.js";

test("editor IDE target helpers parse and resolve references", () => {
  assert.deepEqual(parseObjectPropertyTarget("#12.name"), {
    objectId: "#12",
    propertyName: "name"
  });
  assert.equal(parseObjectPropertyTarget("#12"), null);
  assert.equal(getDefinitionTargetAtPosition("return this:foo();", 13), "this:foo");
  assert.equal(getDefinitionTargetAtPosition("player:tell(#1.name);", 13), "#1.name");
  assert.deepEqual(splitReferenceTarget("#12:look"), {
    kind: "verb",
    objectId: "#12",
    itemName: "look"
  });
  assert.deepEqual(splitReferenceTarget("$thing.name"), {
    kind: "prop",
    objectId: "$thing",
    itemName: "name"
  });
  assert.equal(getEditingObjectId("@program", "#12:look"), "#12");
  assert.equal(getEditingObjectId("@set-note-text", "#12.name"), "#12");
  assert.equal(resolveThisReference("this:foo", "#12"), "#12:foo");
  assert.equal(resolveThisReference("this.name", "#12"), "#12.name");
});

test("editor IDE protocol helpers preserve command strings", () => {
  assert.equal(formatVerbListCommand("#12"), "#$# SDWC%%VERBS%%#12");
  assert.equal(formatPropertyListCommand("#12"), "#$# SDWC%%PROPS%%#12");
  assert.equal(formatVerbOverlayCommand("#12", "look"), "#$# SDWC%%VERB-OVERLAY%%#12%%look");
  assert.equal(formatPropertyOverlayCommand("#12", "name"), "#$# SDWC%%PROP-OVERLAY%%#12%%name");
  assert.equal(formatEditVerbCommand("#12", "look* tell"), "@edit #12:look");
  assert.equal(formatEditPropertyCommand("#12", "name aliases"), "@edit #12.name");
  assert.equal(formatOpenReferenceCommand("#12:look", { openParent: true }), "@edit #12:look --open-parent");
  assert.equal(formatOpenReferenceCommand("#12.name", { openParent: true }), "@edit #12.name");
  assert.deepEqual(getSaveMessages({ uploadCommand: "@program #12:look" }, "content", "note"), [
    "@program #12:look",
    "content\n.",
    "note"
  ]);
  assert.deepEqual(getSaveMessages({ uploadCommand: "@program #12:look" }, "content", ""), [
    "@program #12:look",
    "content\n."
  ]);
});

test("editor IDE payload helpers normalize object browser payloads", () => {
  assert.deepEqual(normalizeObjectVerbsPayload([
    "#12",
    [
      ["#12", "rxd", "look tell", [["this", "none", "this"]]],
      ["#12", "", "", []]
    ]
  ]), {
    objectId: "#12",
    rows: [{
      verbName: "look tell",
      permissions: "rxd",
      argumentsText: "this none this",
      owner: "",
      lastUpdated: ""
    }]
  });

  assert.deepEqual(normalizeObjectVerbsPayload({
    object: "#12",
    verbs: {
      look: {
        name: "look",
        args: ["this", "none", "this"],
        owner: "#2",
        permissions: "rxd",
        lastUpdated: "today"
      }
    }
  }), {
    objectId: "#12",
    rows: [{
      verbName: "look",
      argumentsText: "this none this",
      owner: "#2",
      permissions: "rxd",
      lastUpdated: "today"
    }]
  });

  assert.deepEqual(sortByLabel([{ verbName: "zebra" }, { verbName: "Alpha beta" }]), [
    { verbName: "Alpha beta" },
    { verbName: "zebra" }
  ]);
});

test("editor IDE payload helpers normalize property browser payloads", () => {
  assert.deepEqual(normalizeObjectPropertiesPayload([
    "#12",
    [
      ["#12", "name", ""],
      "description"
    ]
  ]), {
    objectId: "#12",
    rows: [
      { propertyName: "name", clear: false, owner: "", permissions: "" },
      { propertyName: "description", clear: false, owner: "", permissions: "" }
    ],
    objectMeta: null
  });

  assert.deepEqual(normalizeObjectPropertiesPayload({
    object: "#12",
    name: "thing",
    owner: "#2",
    parent: "#1",
    flags: { r: 1, w: true, wizard: "true" },
    props: {
      name: { clear: 1, owner: "#2", permissions: "r" }
    }
  }), {
    objectId: "#12",
    rows: [{ propertyName: "name", clear: true, owner: "#2", permissions: "r" }],
    objectMeta: {
      name: "thing",
      owner: "#2",
      parent: "#1",
      flags: { r: 1, w: true, wizard: "true" }
    }
  });

  assert.deepEqual(sortByPropertyLabel([{ propertyName: "zeta" }, { propertyName: "Alpha beta" }]), [
    { propertyName: "Alpha beta" },
    { propertyName: "zeta" }
  ]);
  assert.equal(formatObjectPermissions({ r: 1, w: true, f: false, wiz: true, prog: "true" }), "+rw+wiz+prog");
});

test("editor IDE overlay payload helpers preserve display behavior", () => {
  assert.deepEqual(getOverlayCacheKeys("#12", "look", { resolved_object: "#10" }), [
    "#12::look",
    "#10::look"
  ]);
  assert.equal(getOverlayDisplayObjectId({
    objectId: "#12",
    payload: { resolvedObject: "#10" }
  }), "#10");
  assert.equal(formatOverlayValue({ value: ["line one", "line two"] }), "line one\nline two");
  assert.equal(formatOverlayValue({ value: 7 }), "7");
});

test("editor IDE overlay update helpers share verb and property behavior", () => {
  const verbUpdate = buildOverlayPayloadUpdate({
    kind: "verb",
    data: {
      objectId: "#12",
      verbName: "look",
      payload: { resolved_object: "#10", value: ["line one"] }
    }
  });
  assert.deepEqual(verbUpdate, {
    cacheKeys: ["#12::look", "#10::look"],
    itemName: "look",
    kind: "verb",
    objectId: "#12",
    payload: { resolved_object: "#10", value: ["line one"] }
  });

  const propUpdate = buildOverlayPayloadUpdate({
    kind: "prop",
    data: {
      objectId: "#12",
      propertyName: "name"
    }
  });
  assert.deepEqual(propUpdate, {
    cacheKeys: ["#12::name"],
    itemName: "name",
    kind: "prop",
    objectId: "#12",
    payload: {}
  });
  assert.equal(buildOverlayPayloadUpdate({ kind: "verb", data: { objectId: "#12" } }), null);
  assert.equal(buildOverlayPayloadUpdate({ kind: "unknown", data: { objectId: "#12" } }), null);

  const overlayCache = { current: { verb: new Map(), prop: new Map() } };
  let overlay = { kind: "verb", objectId: "#12", itemName: "look", loading: true };
  const setHoverOverlay = (updater) => {
    overlay = updater(overlay);
  };
  assert.equal(applyOverlayPayload({ overlayCache, setHoverOverlay, update: verbUpdate }), true);
  assert.deepEqual(overlayCache.current.verb.get("#12::look"), { resolved_object: "#10", value: ["line one"] });
  assert.deepEqual(overlayCache.current.verb.get("#10::look"), { resolved_object: "#10", value: ["line one"] });
  assert.deepEqual(overlay, {
    kind: "verb",
    objectId: "#12",
    itemName: "look",
    loading: false,
    payload: { resolved_object: "#10", value: ["line one"] }
  });

  overlay = { kind: "prop", objectId: "#12", itemName: "other", loading: true };
  assert.equal(applyOverlayPayload({ overlayCache, setHoverOverlay, update: propUpdate }), true);
  assert.deepEqual(overlayCache.current.prop.get("#12::name"), {});
  assert.deepEqual(overlay, { kind: "prop", objectId: "#12", itemName: "other", loading: true });
  assert.equal(applyOverlayPayload({ overlayCache, setHoverOverlay, update: null }), false);
});

test("editor IDE tab helpers build editable and pinned browser tabs", () => {
  const objectBrowser = createObjectBrowserTab();
  const propertyBrowser = createPropertyBrowserTab();
  const editable = createEditableTab({
    id: 3,
    editor: {
      editorName: "Look",
      uploadCommand: "@program #12:look",
      buffer: "content"
    },
    title: "Look",
    command: "@program",
    commandTarget: "#12:look",
    name: "Look|#12:look",
    isProgramCommand: true
  });

  assert.equal(buildTitle({ obj: "#12", verb: "look" }), "#12:look");
  assert.deepEqual(buildIdeTabs([editable], { objectBrowser: true, propertyBrowser: true }).map((tab) => tab.title), [
    "Object Browser",
    "Property Browser",
    "Look"
  ]);
  assert.deepEqual(pinBrowserTabs([editable, propertyBrowser, objectBrowser]).map((tab) => tab.title), [
    "Object Browser",
    "Property Browser",
    "Look"
  ]);
  assert.deepEqual(editable, {
    id: 3,
    name: "Look|#12:look",
    title: "Look",
    uploadCommand: "@program #12:look",
    editorName: "Look",
    command: "@program",
    commandTarget: "#12:look",
    content: "content",
    savedContent: "content",
    dirty: false,
    vmsNote: ""
  });
  assert.deepEqual(objectBrowser, {
    id: TAB_TYPES.objectBrowser,
    name: TAB_TYPES.objectBrowser,
    title: "Object Browser",
    editorName: "Object Browser",
    tabType: TAB_TYPES.objectBrowser
  });
  assert.deepEqual(propertyBrowser, {
    id: TAB_TYPES.propertyBrowser,
    name: TAB_TYPES.propertyBrowser,
    title: "Property Browser",
    editorName: "Property Browser",
    tabType: TAB_TYPES.propertyBrowser
  });
  assert.equal(Object.prototype.hasOwnProperty.call(objectBrowser, "content"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(objectBrowser, "savedContent"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(objectBrowser, "dirty"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(objectBrowser, "uploadCommand"), false);
});

test("editor IDE open-tab planner classifies editable command contexts", () => {
  assert.deepEqual(classifyEditorCommand({
    editorName: "Look",
    uploadCommand: "@program #12:look"
  }), {
    command: "@program",
    commandTarget: "#12:look",
    isProgramCommand: true,
    isPropertyContext: false,
    isVerbContext: true,
    name: "Look|#12:look",
    title: "Look"
  });
  assert.deepEqual(classifyEditorCommand({
    editorName: "Name",
    uploadCommand: "@edit #12.name"
  }), {
    command: "@edit",
    commandTarget: "#12.name",
    isProgramCommand: false,
    isPropertyContext: true,
    isVerbContext: false,
    name: "Name|#12.name",
    title: "Name"
  });
});

test("editor IDE open-tab planner creates browser effects and duplicate plans", () => {
  const programPlan = buildOpenTabPlan({
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "content"
  }, [], () => 7);
  assert.equal(programPlan.type, "openEditableTab");
  assert.equal(programPlan.objectBrowser, true);
  assert.equal(programPlan.propertyBrowser, false);
  assert.deepEqual(programPlan.browserEffects, [
    { type: "upsertObjectVerb", objectId: "#12", verbLabel: "look" }
  ]);
  assert.equal(programPlan.tab.id, 7);
  assert.equal(programPlan.tab.name, "Look|#12:look");

  const editVerbPlan = buildOpenTabPlan({
    editorName: "Tell",
    uploadCommand: "@edit #12:tell"
  }, [], () => 8);
  assert.deepEqual(editVerbPlan.browserEffects, [
    { type: "upsertObjectVerb", objectId: "#12", verbLabel: "tell" }
  ]);

  const propertyPlan = buildOpenTabPlan({
    editorName: "Name",
    uploadCommand: "@set-note-text #12.name"
  }, [], () => 9);
  assert.equal(propertyPlan.objectBrowser, false);
  assert.equal(propertyPlan.propertyBrowser, true);
  assert.deepEqual(propertyPlan.browserEffects, [
    { type: "upsertObjectProperty", objectId: "#12", propertyLabel: "name" }
  ]);

  const scratchPlan = buildOpenTabPlan({
    editorName: "Temporary Scratch Pad",
    name: "Temporary Scratch Pad 1",
    uploadCommand: "@scratch Temporary Scratch Pad"
  }, [], () => 10);
  assert.equal(scratchPlan.objectBrowser, false);
  assert.equal(scratchPlan.propertyBrowser, false);
  assert.deepEqual(scratchPlan.browserEffects, []);

  const duplicatePlan = buildOpenTabPlan({
    editorName: "Look",
    uploadCommand: "@program #12:look",
    buffer: "replacement"
  }, [programPlan.tab], () => 11);
  assert.deepEqual(duplicatePlan, {
    duplicateMessage: DUPLICATE_TAB_MESSAGE,
    id: 7,
    type: "activateExisting"
  });
});

test("editor IDE save helpers preserve prompt and emit behavior", () => {
  const tab = {
    id: 3,
    command: "@program",
    commandTarget: "#12:look",
    uploadCommand: "@program #12:look",
    vmsNote: ""
  };
  assert.equal(shouldPromptForVmsNote(tab, true), true);
  assert.equal(shouldPromptForVmsNote({ ...tab, vmsNote: "changed" }, true), false);
  assert.equal(shouldPromptForVmsNote(tab, false), false);

  const dispatches = [];
  const messages = [];
  assert.equal(saveTab({
    dispatchIde: (action) => dispatches.push(action),
    emitInput: (message) => {
      messages.push(message);
      return true;
    },
    getEditorValue: () => "content",
    tab,
    vmsNoteLine: "changed look behavior"
  }), true);
  assert.deepEqual(messages, [
    "@program #12:look",
    "content\n.",
    "changed look behavior"
  ]);
  assert.deepEqual(dispatches, [
    { type: "markDocumentSaved", id: 3, content: "content" }
  ]);

  const failedDispatches = [];
  assert.equal(saveTab({
    dispatchIde: (action) => failedDispatches.push(action),
    emitInput: () => false,
    getEditorValue: () => "content",
    tab
  }), false);
  assert.deepEqual(failedDispatches, []);

  assert.equal(saveTab({
    dispatchIde: (action) => failedDispatches.push(action),
    emitInput: () => true,
    getEditorValue: () => null,
    tab
  }), false);
});

test("editor IDE keyboard helpers select shortcut commands", () => {
  assert.equal(getShortcutCommand({ key: "Escape" }, { isVmsPromptOpen: true }), "cancel-vms-prompt");
  assert.equal(getShortcutCommand({ key: "Enter" }, { isVmsPromptOpen: true }), "submit-vms-prompt");
  assert.equal(getShortcutCommand({ key: "Escape" }, { showShortcuts: true }), "hide-shortcuts");
  assert.equal(getShortcutCommand({ key: "/", ctrlKey: true }, { platform: "Win32" }), "toggle-shortcuts");
  assert.equal(getShortcutCommand({ key: "/", metaKey: true }, { platform: "MacIntel" }), "toggle-shortcuts");
  assert.equal(getShortcutCommand({ key: "s", ctrlKey: true }), "save");
  assert.equal(getShortcutCommand({ key: "e", ctrlKey: true }), "close");
  assert.equal(getShortcutCommand({ key: "1", ctrlKey: true }), "enable-vim");
  assert.equal(getShortcutCommand({ key: "0", ctrlKey: true }), "disable-vim");
  assert.equal(getShortcutCommand({ key: "[", ctrlKey: true }), "previous-tab");
  assert.equal(getShortcutCommand({ key: "]", ctrlKey: true }), "next-tab");
  assert.equal(getShortcutCommand({ key: "L", ctrlKey: true, shiftKey: true }), "toggle-word-wrap");
  assert.equal(getShortcutCommand({ key: "X", ctrlKey: true, shiftKey: true }), "toggle-orientation");
  assert.equal(getShortcutCommand({ key: "s" }), "");

  const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(getAdjacentTabId(tabs, 2, -1), 1);
  assert.equal(getAdjacentTabId(tabs, 2, 1), 3);
  assert.equal(getAdjacentTabId(tabs, 1, -1), 3);
  assert.equal(getAdjacentTabId([], 1, 1), null);
});

test("editor IDE recent-tab and label helpers preserve close fallback and labels", () => {
  const tabs = [
    { id: TAB_TYPES.objectBrowser, tabType: TAB_TYPES.objectBrowser },
    { id: 1, uploadCommand: "@program #12:look", editorName: "Look" },
    { id: 2, uploadCommand: "@edit #12.name", editorName: "Name" }
  ];
  assert.equal(getFallbackTabId([1, 2], tabs), 2);
  assert.equal(getFallbackTabId([7], tabs), TAB_TYPES.objectBrowser);
  assert.equal(getFallbackTabId([], []), null);
  assert.deepEqual(getNextActiveTabIdAfterClose({
    active: 2,
    closedId: 2,
    recentTabIds: [TAB_TYPES.objectBrowser, 1, 2],
    tabs
  }), {
    nextActiveId: 1,
    nextRecentTabIds: [TAB_TYPES.objectBrowser, 1],
    nextTabs: [
      { id: TAB_TYPES.objectBrowser, tabType: TAB_TYPES.objectBrowser },
      { id: 1, uploadCommand: "@program #12:look", editorName: "Look" }
    ]
  });
  assert.deepEqual(getNextActiveTabIdAfterClose({
    active: 1,
    closedId: 2,
    recentTabIds: [1, 2],
    tabs
  }).nextActiveId, 1);

  assert.equal(isBrowserActiveTab({ tabType: TAB_TYPES.objectBrowser }), true);
  assert.equal(isBrowserActiveTab({ tabType: "editable" }), false);
  assert.equal(buildEditingLabel({
    activeTab: { tabType: TAB_TYPES.propertyBrowser },
    vimMode: false
  }), "Property Browser");
  assert.equal(buildEditingLabel({
    activeTab: { uploadCommand: "@program #12:look", editorName: "Look" },
    vimMode: true
  }), "VIM Editing | #12:look");
});

test("editor IDE reducer opens, activates, changes, and saves documents", () => {
  const tab = createEditableTab({
    id: 3,
    editor: {
      editorName: "Look",
      uploadCommand: "@program #12:look",
      buffer: "content"
    },
    title: "Look",
    command: "@program",
    commandTarget: "#12:look",
    name: "Look|#12:look",
    isProgramCommand: true
  });
  const opened = ideReducer(initialIdeState, {
    type: "openEditableTab",
    objectBrowser: true,
    propertyBrowser: false,
    tab
  });

  assert.equal(opened.active, 3);
  assert.equal(opened.panels.objectBrowser, true);
  assert.deepEqual(opened.documents, [tab]);

  const duplicate = ideReducer(opened, {
    type: "openEditableTab",
    tab: { ...tab, id: 4, content: "replacement" }
  });
  assert.equal(duplicate.active, 3);
  assert.deepEqual(duplicate.documents, [tab]);

  const changed = ideReducer(opened, { type: "markDocumentChanged", id: 3, content: "new content" });
  assert.equal(changed.documents[0].dirty, true);
  assert.equal(changed.documents[0].content, "new content");

  const saved = ideReducer(changed, { type: "markDocumentSaved", id: 3, content: "new content" });
  assert.equal(saved.documents[0].dirty, false);
  assert.equal(saved.documents[0].savedContent, "new content");
});

test("editor IDE reducer closes panels and documents with explicit active fallback", () => {
  const firstTab = createEditableTab({
    id: 1,
    editor: { editorName: "One", uploadCommand: "@program #1:one" },
    title: "One",
    command: "@program",
    commandTarget: "#1:one",
    name: "One|#1:one",
    isProgramCommand: true
  });
  const secondTab = createEditableTab({
    id: 2,
    editor: { editorName: "Two", uploadCommand: "@program #1:two" },
    title: "Two",
    command: "@program",
    commandTarget: "#1:two",
    name: "Two|#1:two",
    isProgramCommand: true
  });
  const state = {
    ...initialIdeState,
    active: TAB_TYPES.objectBrowser,
    documents: [firstTab, secondTab],
    panels: { objectBrowser: true, propertyBrowser: true }
  };

  const withoutPanel = ideReducer(state, {
    type: "closeTab",
    id: TAB_TYPES.objectBrowser,
    nextActiveId: 2
  });
  assert.equal(withoutPanel.panels.objectBrowser, false);
  assert.equal(withoutPanel.panels.propertyBrowser, true);
  assert.equal(withoutPanel.active, 2);
  assert.deepEqual(withoutPanel.documents, [firstTab, secondTab]);

  const withoutDocument = ideReducer({ ...state, active: 2 }, {
    type: "closeTab",
    id: 2,
    nextActiveId: 1
  });
  assert.equal(withoutDocument.active, 1);
  assert.deepEqual(withoutDocument.documents, [firstTab]);
});

test("editor IDE reducer updates browser graph state", () => {
  const withVerb = ideReducer(initialIdeState, {
    type: "upsertObjectVerb",
    objectId: "#12",
    verbLabel: "look"
  });
  assert.deepEqual(withVerb.objectGraph["#12"], [
    { verbName: "look", permissions: "", argumentsText: "" }
  ]);
  assert.equal(withVerb.collapsedObjects["#12"], true);

  const loadedVerbs = ideReducer(withVerb, {
    type: "replaceObjectVerbs",
    objectId: "#12",
    rows: [
      { verbName: "zeta" },
      { verbName: "" },
      { verbName: "alpha" },
      { verbName: "zeta", owner: "#2" }
    ]
  });
  assert.deepEqual(loadedVerbs.objectGraph["#12"], [
    { verbName: "alpha" },
    { verbName: "zeta", owner: "#2" }
  ]);
  assert.equal(ideReducer(loadedVerbs, { type: "loadObjectVerbs", objectId: "#12" }).collapsedObjects["#12"], false);
  assert.equal(
    ideReducer(loadedVerbs, { type: "toggleObjectCollapsed", objectId: "#12" }).collapsedObjects["#12"],
    false
  );

  const withProperty = ideReducer(initialIdeState, {
    type: "upsertObjectProperty",
    objectId: "#12",
    propertyLabel: "name"
  });
  assert.deepEqual(withProperty.propertyGraph["#12"], [
    { propertyName: "name", clear: false }
  ]);
  assert.equal(withProperty.collapsedProperties["#12"], true);

  const loadedProperties = ideReducer(withProperty, {
    type: "replaceObjectProperties",
    objectId: "#12",
    objectMeta: { owner: "#2" },
    rows: [
      { propertyName: "zeta" },
      { propertyName: "" },
      { propertyName: "alpha" },
      { propertyName: "zeta", owner: "#2" }
    ]
  });
  assert.deepEqual(loadedProperties.propertyGraph["#12"], [
    { propertyName: "alpha" },
    { propertyName: "zeta", owner: "#2" }
  ]);
  assert.deepEqual(loadedProperties.propertyObjectMeta["#12"], { owner: "#2" });
  assert.equal(
    ideReducer(loadedProperties, { type: "loadObjectProperties", objectId: "#12" }).collapsedProperties["#12"],
    false
  );
  assert.equal(
    ideReducer(loadedProperties, { type: "togglePropertyCollapsed", objectId: "#12" }).collapsedProperties["#12"],
    false
  );
});

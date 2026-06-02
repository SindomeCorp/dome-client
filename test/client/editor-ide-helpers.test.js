import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefinitionTargetAtPosition,
  getEditingObjectId,
  parseObjectPropertyTarget,
  resolveThisReference,
  splitReferenceTarget
} from "../../src/client/react/editor-ide/targets.js";
import {
  formatEditPropertyCommand,
  formatEditVerbCommand,
  formatOpenReferenceCommand,
  formatPropertyListCommand,
  formatPropertyOverlayCommand,
  formatVerbListCommand,
  formatVerbOverlayCommand,
  getSaveMessages
} from "../../src/client/react/editor-ide/protocol.js";
import {
  formatObjectPermissions,
  formatOverlayValue,
  getOverlayCacheKeys,
  getOverlayDisplayObjectId,
  normalizeObjectPropertiesPayload,
  normalizeObjectVerbsPayload,
  sortByLabel,
  sortByPropertyLabel
} from "../../src/client/react/editor-ide/payloads.js";
import {
  buildIdeTabs,
  buildTitle,
  createEditableTab,
  createObjectBrowserTab,
  createPropertyBrowserTab,
  pinBrowserTabs
} from "../../src/client/react/editor-ide/tabs.js";
import {
  ideReducer,
  initialIdeState
} from "../../src/client/react/editor-ide/state.js";

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
    id: "object-browser",
    name: "object-browser",
    title: "Object Browser",
    editorName: "Object Browser",
    tabType: "object-browser"
  });
  assert.deepEqual(propertyBrowser, {
    id: "property-browser",
    name: "property-browser",
    title: "Property Browser",
    editorName: "Property Browser",
    tabType: "property-browser"
  });
  assert.equal(Object.prototype.hasOwnProperty.call(objectBrowser, "content"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(objectBrowser, "savedContent"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(objectBrowser, "dirty"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(objectBrowser, "uploadCommand"), false);
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
    active: "object-browser",
    documents: [firstTab, secondTab],
    panels: { objectBrowser: true, propertyBrowser: true }
  };

  const withoutPanel = ideReducer(state, {
    type: "closeTab",
    id: "object-browser",
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

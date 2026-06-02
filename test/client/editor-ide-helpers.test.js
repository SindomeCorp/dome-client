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
  buildTitle,
  createEditableTab,
  createObjectBrowserTab,
  createPropertyBrowserTab,
  pinBrowserTabs
} from "../../src/client/react/editor-ide/tabs.js";

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
  const objectBrowser = createObjectBrowserTab(1);
  const propertyBrowser = createPropertyBrowserTab(2);
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
});

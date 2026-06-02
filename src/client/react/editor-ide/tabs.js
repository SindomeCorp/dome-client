export const OBJECT_BROWSER_TAB = {
  id: "object-browser",
  name: "object-browser",
  title: "Object Browser",
  editorName: "Object Browser",
  tabType: "object-browser"
};

export const PROPERTY_BROWSER_TAB = {
  id: "property-browser",
  name: "property-browser",
  title: "Property Browser",
  editorName: "Property Browser",
  tabType: "property-browser"
};

export function buildTitle(editor) {
  if (editor.editorName) return editor.editorName;
  if (editor.obj && (editor.verb || editor.prop || editor.property)) {
    return `${editor.obj}:${editor.verb || editor.prop || editor.property}`;
  }
  return editor.uploadCommand || "Untitled";
}

export function pinBrowserTabs(list) {
  const objectBrowser = list.find((tab) => tab.tabType === "object-browser");
  const propertyBrowser = list.find((tab) => tab.tabType === "property-browser");
  const otherTabs = list.filter((tab) => tab.tabType !== "object-browser" && tab.tabType !== "property-browser");
  const pinned = [];
  if (objectBrowser) pinned.push(objectBrowser);
  if (propertyBrowser) pinned.push(propertyBrowser);
  return [...pinned, ...otherTabs];
}

export function buildIdeTabs(documents, panels) {
  const tabs = [];
  if (panels.objectBrowser) tabs.push(OBJECT_BROWSER_TAB);
  if (panels.propertyBrowser) tabs.push(PROPERTY_BROWSER_TAB);
  return [...tabs, ...documents];
}

export function createEditableTab({
  id,
  editor,
  title,
  command,
  commandTarget,
  name,
  isProgramCommand
}) {
  return {
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
    vmsNote: isProgramCommand ? "" : null
  };
}

export function createObjectBrowserTab(id) {
  return { ...OBJECT_BROWSER_TAB, id: id || OBJECT_BROWSER_TAB.id };
}

export function createPropertyBrowserTab(id) {
  return { ...PROPERTY_BROWSER_TAB, id: id || PROPERTY_BROWSER_TAB.id };
}

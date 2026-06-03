export const TAB_TYPES = {
  objectBrowser: "object-browser",
  propertyBrowser: "property-browser"
};

export const OBJECT_BROWSER_TAB = {
  id: TAB_TYPES.objectBrowser,
  name: TAB_TYPES.objectBrowser,
  title: "Object Browser",
  editorName: "Object Browser",
  tabType: TAB_TYPES.objectBrowser
};

export const PROPERTY_BROWSER_TAB = {
  id: TAB_TYPES.propertyBrowser,
  name: TAB_TYPES.propertyBrowser,
  title: "Property Browser",
  editorName: "Property Browser",
  tabType: TAB_TYPES.propertyBrowser
};

export function isBrowserTab(tab) {
  return tab?.tabType === TAB_TYPES.objectBrowser || tab?.tabType === TAB_TYPES.propertyBrowser;
}

export function buildTitle(editor) {
  if (editor.editorName) return editor.editorName;
  if (editor.obj && (editor.verb || editor.prop || editor.property)) {
    return `${editor.obj}:${editor.verb || editor.prop || editor.property}`;
  }
  return editor.uploadCommand || "Untitled";
}

export function pinBrowserTabs(list) {
  const objectBrowser = list.find((tab) => tab.tabType === TAB_TYPES.objectBrowser);
  const propertyBrowser = list.find((tab) => tab.tabType === TAB_TYPES.propertyBrowser);
  const otherTabs = list.filter((tab) => !isBrowserTab(tab));
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

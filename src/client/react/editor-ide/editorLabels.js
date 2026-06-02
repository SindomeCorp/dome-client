import { getCommandLabel } from "../../command-utils.js";
import { TAB_TYPES } from "./tabs.js";

const BROWSER_TAB_TITLE_BY_TYPE = {
  [TAB_TYPES.objectBrowser]: "Object Browser",
  [TAB_TYPES.propertyBrowser]: "Property Browser"
};

export function isBrowserActiveTab(tab) {
  return Object.prototype.hasOwnProperty.call(BROWSER_TAB_TITLE_BY_TYPE, tab?.tabType || "");
}

export function buildEditingLabel({ activeTab, vimMode }) {
  if (isBrowserActiveTab(activeTab)) {
    return BROWSER_TAB_TITLE_BY_TYPE[activeTab.tabType];
  }
  const inputLabel = getCommandLabel(activeTab?.uploadCommand, activeTab?.editorName);
  return `${vimMode ? "VIM Editing" : "Normal Editing"}${inputLabel ? ` | ${inputLabel}` : ""}`;
}

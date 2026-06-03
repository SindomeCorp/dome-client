import {
  OBJECT_BROWSER_TAB,
  PROPERTY_BROWSER_TAB
} from "./tabs.js";
import {
  sortByLabel,
  sortByPropertyLabel
} from "./payloads.js";

export const initialIdeState = {
  documents: [],
  panels: {
    objectBrowser: false,
    propertyBrowser: false
  },
  objectGraph: {},
  collapsedObjects: {},
  propertyGraph: {},
  collapsedProperties: {},
  propertyObjectMeta: {},
  active: null
};

export function ideReducer(state, action) {
  switch (action.type) {
  case "activateTab":
    return { ...state, active: action.id };
  case "openEditableTab":
    return openEditableTab(state, action);
  case "openPanels":
    return {
      ...state,
      panels: {
        objectBrowser: state.panels.objectBrowser || Boolean(action.objectBrowser),
        propertyBrowser: state.panels.propertyBrowser || Boolean(action.propertyBrowser)
      }
    };
  case "markDocumentChanged":
    return {
      ...state,
      documents: state.documents.map((document) =>
        document.id === action.id
          ? { ...document, content: action.content, dirty: action.content !== document.savedContent }
          : document
      )
    };
  case "markDocumentSaved":
    return {
      ...state,
      documents: state.documents.map((document) =>
        document.id === action.id
          ? { ...document, savedContent: action.content, dirty: false }
          : document
      )
    };
  case "updateVmsNote":
    return {
      ...state,
      documents: state.documents.map((document) =>
        document.id === action.id ? { ...document, vmsNote: action.vmsNote } : document
      )
    };
  case "closeTab":
    return closeTab(state, action);
  case "upsertObjectVerb":
    return upsertObjectVerb(state, action.objectId, action.verbLabel);
  case "replaceObjectVerbs":
    return replaceObjectVerbs(state, action.objectId, action.rows);
  case "loadObjectVerbs":
    return {
      ...state,
      collapsedObjects: { ...state.collapsedObjects, [action.objectId]: false }
    };
  case "toggleObjectCollapsed":
    return {
      ...state,
      collapsedObjects: {
        ...state.collapsedObjects,
        [action.objectId]: !state.collapsedObjects[action.objectId]
      }
    };
  case "upsertObjectProperty":
    return upsertObjectProperty(state, action.objectId, action.propertyLabel);
  case "replaceObjectProperties":
    return replaceObjectProperties(state, action.objectId, action.rows, action.objectMeta);
  case "loadObjectProperties":
    return {
      ...state,
      collapsedProperties: { ...state.collapsedProperties, [action.objectId]: false }
    };
  case "togglePropertyCollapsed":
    return {
      ...state,
      collapsedProperties: {
        ...state.collapsedProperties,
        [action.objectId]: !state.collapsedProperties[action.objectId]
      }
    };
  default:
    return state;
  }
}

function openEditableTab(state, action) {
  const existing = state.documents.find((document) => document.name === action.tab.name);
  if (existing) {
    return { ...state, active: existing.id };
  }
  return {
    ...state,
    active: action.tab.id,
    documents: [...state.documents, action.tab],
    panels: {
      objectBrowser: state.panels.objectBrowser || Boolean(action.objectBrowser),
      propertyBrowser: state.panels.propertyBrowser || Boolean(action.propertyBrowser)
    }
  };
}

function closeTab(state, action) {
  if (action.id === OBJECT_BROWSER_TAB.id) {
    return {
      ...state,
      active: state.active === action.id ? action.nextActiveId ?? null : state.active,
      panels: { ...state.panels, objectBrowser: false }
    };
  }
  if (action.id === PROPERTY_BROWSER_TAB.id) {
    return {
      ...state,
      active: state.active === action.id ? action.nextActiveId ?? null : state.active,
      panels: { ...state.panels, propertyBrowser: false }
    };
  }
  return {
    ...state,
    active: state.active === action.id ? action.nextActiveId ?? null : state.active,
    documents: state.documents.filter((document) => document.id !== action.id)
  };
}

function upsertObjectVerb(state, objectId, verbLabel) {
  const current = state.objectGraph[objectId] || [];
  if (current.some((entry) => entry.verbName === verbLabel)) return state;
  return {
    ...state,
    collapsedObjects: Object.prototype.hasOwnProperty.call(state.collapsedObjects, objectId)
      ? state.collapsedObjects
      : { ...state.collapsedObjects, [objectId]: true },
    objectGraph: {
      ...state.objectGraph,
      [objectId]: sortByLabel([
        ...current,
        { verbName: verbLabel, permissions: "", argumentsText: "" }
      ])
    }
  };
}

function replaceObjectVerbs(state, objectId, rows) {
  const dedupedMap = new Map();
  rows.forEach((row) => {
    if (!row.verbName) return;
    dedupedMap.set(row.verbName, row);
  });
  return {
    ...state,
    collapsedObjects: Object.prototype.hasOwnProperty.call(state.collapsedObjects, objectId)
      ? state.collapsedObjects
      : { ...state.collapsedObjects, [objectId]: true },
    objectGraph: {
      ...state.objectGraph,
      [objectId]: sortByLabel(Array.from(dedupedMap.values()))
    }
  };
}

function upsertObjectProperty(state, objectId, propertyLabel) {
  const current = state.propertyGraph[objectId] || [];
  if (current.some((entry) => entry.propertyName === propertyLabel)) return state;
  return {
    ...state,
    collapsedProperties: Object.prototype.hasOwnProperty.call(state.collapsedProperties, objectId)
      ? state.collapsedProperties
      : { ...state.collapsedProperties, [objectId]: true },
    propertyGraph: {
      ...state.propertyGraph,
      [objectId]: sortByPropertyLabel([
        ...current,
        { propertyName: propertyLabel, clear: false }
      ])
    }
  };
}

function replaceObjectProperties(state, objectId, rows, objectMeta) {
  const dedupedMap = new Map();
  rows.forEach((row) => {
    if (!row.propertyName) return;
    dedupedMap.set(row.propertyName, row);
  });
  const nextState = {
    ...state,
    collapsedProperties: Object.prototype.hasOwnProperty.call(state.collapsedProperties, objectId)
      ? state.collapsedProperties
      : { ...state.collapsedProperties, [objectId]: true },
    propertyGraph: {
      ...state.propertyGraph,
      [objectId]: sortByPropertyLabel(Array.from(dedupedMap.values()))
    }
  };
  if (!objectMeta || typeof objectMeta !== "object") return nextState;
  return {
    ...nextState,
    propertyObjectMeta: {
      ...state.propertyObjectMeta,
      [objectId]: objectMeta
    }
  };
}

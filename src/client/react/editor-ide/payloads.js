import { getPrimaryAlias, getPrimaryProperty } from "./targets.js";

export function sortByLabel(items) {
  return [...items].sort((a, b) =>
    getPrimaryAlias(a.verbName).localeCompare(
      getPrimaryAlias(b.verbName),
      undefined,
      { sensitivity: "base" }
    )
  );
}

export function sortByPropertyLabel(items) {
  return [...items].sort((a, b) =>
    getPrimaryProperty(a.propertyName).localeCompare(
      getPrimaryProperty(b.propertyName),
      undefined,
      { sensitivity: "base" }
    )
  );
}

export function normalizeObjectVerbsPayload(payload) {
  if (!payload) return null;

  if (Array.isArray(payload) && payload.length >= 2) {
    const objectId = String(payload[0] || "").trim();
    const rows = Array.isArray(payload[1]) ? payload[1] : [];
    if (!objectId) return null;
    return {
      objectId,
      rows: rows.map(normalizeLegacyVerbRow).filter(Boolean)
    };
  }

  if (typeof payload !== "object") return null;
  const objectId = String(payload.object || payload.id || "").trim();
  if (!objectId) return null;
  const verbsObj = payload.verbs && typeof payload.verbs === "object" ? payload.verbs : {};
  return {
    objectId,
    rows: Object.values(verbsObj).map(normalizeObjectVerb).filter(Boolean)
  };
}

export function normalizeObjectPropertiesPayload(payload) {
  if (!payload) return null;

  if (Array.isArray(payload) && payload.length >= 2) {
    const objectId = String(payload[0] || "").trim();
    const rows = Array.isArray(payload[1]) ? payload[1] : [];
    if (!objectId) return null;
    return {
      objectId,
      rows: rows.map((row) => normalizeLegacyPropertyRow(row, objectId)).filter(Boolean),
      objectMeta: null
    };
  }

  if (typeof payload !== "object") return null;
  const objectId = String(payload.object || payload.id || "").trim();
  if (!objectId) return null;
  const props = payload.props && typeof payload.props === "object" ? payload.props : {};
  return {
    objectId,
    rows: Object.entries(props).map(normalizeObjectProperty).filter(Boolean),
    objectMeta: {
      name: String(payload.name || "").trim(),
      owner: String(payload.owner || "").trim(),
      parent: String(payload.parent || "").trim(),
      flags: payload.flags && typeof payload.flags === "object" ? payload.flags : {}
    }
  };
}

export function getOverlayResolvedObjectId(requestObjectId, payload) {
  const resolvedObjectId = String(payload?.resolved_object || payload?.resolvedObject || "").trim();
  return resolvedObjectId || String(requestObjectId || "").trim();
}

export function getOverlayCacheKeys(requestObjectId, itemName, payload) {
  const requestObject = String(requestObjectId || "").trim();
  const item = String(itemName || "").trim();
  if (!requestObject || !item) return [];
  const resolvedObject = getOverlayResolvedObjectId(requestObject, payload);
  const keys = [`${requestObject}::${item}`];
  if (resolvedObject && resolvedObject !== requestObject) {
    keys.push(`${resolvedObject}::${item}`);
  }
  return keys;
}

export function getOverlayDisplayObjectId(overlay) {
  if (!overlay) return "";
  return getOverlayResolvedObjectId(overlay.objectId, overlay.payload);
}

export function formatOverlayValue(payload) {
  const value = payload?.value;
  if (Array.isArray(value)) {
    return value.map((line) => String(line ?? "")).join("\n");
  }
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export function formatObjectPermissions(flags) {
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
}

function normalizeLegacyVerbRow(row) {
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
}

function normalizeObjectVerb(verb) {
  if (!verb || typeof verb !== "object") return "";
  const verbName = String(verb.name || "").trim();
  if (!verbName) return "";
  const args = Array.isArray(verb.args)
    ? verb.args.map((x) => String(x)).join(" ")
    : String(verb.args || "").trim();
  return {
    verbName,
    argumentsText: args,
    owner: String(verb.owner || "").trim(),
    permissions: String(verb.permissions || "").trim(),
    lastUpdated: String(verb["last updated"] || verb.lastUpdated || "").trim()
  };
}

function normalizeLegacyPropertyRow(row, objectId) {
  if (Array.isArray(row)) {
    const rawName = [row[1], row[2], row[0]].find((part) => String(part || "").trim()) || "";
    const propertyName = String(rawName || "").trim();
    if (!propertyName || propertyName === objectId) return "";
    return { propertyName, clear: false, owner: "", permissions: "" };
  }
  const propertyName = String(row || "").trim();
  if (!propertyName) return "";
  return { propertyName, clear: false, owner: "", permissions: "" };
}

function normalizeObjectProperty([propertyName, propData]) {
  const name = String(propertyName || "").trim();
  if (!name) return "";
  return {
    propertyName: name,
    clear: Number(propData?.clear) === 1,
    owner: String(propData?.owner || "").trim(),
    permissions: String(propData?.permissions || "").trim()
  };
}

function isEnabledFlag(value) {
  return value === 1 || value === true || String(value).trim() === "1" || String(value).toLowerCase() === "true";
}

export const PROPERTY_EDIT_COMMANDS = new Set(["@set-note-string", "@set-note-text"]);

export function getPrimaryAlias(verbName) {
  return String(verbName || "").trim().split(/\s+/)[0] || "";
}

export function getPrimaryProperty(propertyName) {
  return String(propertyName || "").trim().split(/\s+/)[0] || "";
}

export function parseObjectPropertyTarget(target) {
  const value = String(target || "").trim();
  const dotAt = value.indexOf(".");
  if (dotAt <= 0 || dotAt >= value.length - 1) return null;
  const objectId = value.slice(0, dotAt).trim();
  const propertyName = value.slice(dotAt + 1).trim();
  if (!objectId || !propertyName) return null;
  return { objectId, propertyName };
}

export function getDefinitionTargetAtPosition(line, column) {
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
}

export function splitReferenceTarget(target) {
  const raw = String(target || "").trim();
  if (!raw) return null;
  const separator = raw.includes(":") ? ":" : raw.includes(".") ? "." : "";
  if (!separator) return null;
  const idx = raw.indexOf(separator);
  if (idx <= 0 || idx >= raw.length - 1) return null;
  return {
    kind: separator === ":" ? "verb" : "prop",
    objectId: raw.slice(0, idx),
    itemName: raw.slice(idx + 1)
  };
}

export function getEditingObjectId(command, commandTarget) {
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
}

export function resolveThisReference(target, editingObjectId) {
  const raw = String(target || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("this:") && !raw.startsWith("this.")) return raw;
  if (!editingObjectId) return "";
  return `${editingObjectId}${raw.slice(4)}`;
}

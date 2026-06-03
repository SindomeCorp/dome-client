export function formatVerbListCommand(objectId) {
  return `#$# SDWC%%VERBS%%${objectId}`;
}

export function formatPropertyListCommand(objectId) {
  return `#$# SDWC%%PROPS%%${objectId}`;
}

export function formatVerbOverlayCommand(objectId, verbName) {
  return `#$# SDWC%%VERB-OVERLAY%%${objectId}%%${verbName}`;
}

export function formatPropertyOverlayCommand(objectId, propertyName) {
  return `#$# SDWC%%PROP-OVERLAY%%${objectId}%%${propertyName}`;
}

export function formatEditVerbCommand(objectId, rawVerbName) {
  const firstAlias = String(rawVerbName || "").trim().split(/\s+/)[0] || "";
  const verbName = firstAlias.includes("*")
    ? firstAlias.slice(0, firstAlias.indexOf("*")).trim()
    : firstAlias;
  if (!objectId || !verbName) return "";
  return `@edit ${objectId}:${verbName}`;
}

export function formatEditPropertyCommand(objectId, rawPropertyName) {
  const propertyName = String(rawPropertyName || "").trim().split(/\s+/)[0] || "";
  if (!objectId || !propertyName) return "";
  return `@edit ${objectId}.${propertyName}`;
}

export function formatOpenReferenceCommand(target, { openParent = false } = {}) {
  const cleanTarget = String(target || "").trim();
  if (!cleanTarget) return "";
  const openParentSuffix = openParent && cleanTarget.includes(":") ? " --open-parent" : "";
  return `@edit ${cleanTarget}${openParentSuffix}`;
}

export function getSaveMessages(tab, content, vmsNoteLine = null) {
  const messages = [tab.uploadCommand, `${content}\n.`];
  if (typeof vmsNoteLine === "string" && vmsNoteLine.trim() !== "") {
    messages.push(vmsNoteLine);
  }
  return messages;
}

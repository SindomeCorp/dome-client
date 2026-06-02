import { getOverlayCacheKeys } from "./payloads.js";

const ITEM_FIELD_BY_KIND = {
  prop: "propertyName",
  verb: "verbName"
};

export function buildOverlayPayloadUpdate({ data, kind }) {
  const itemField = ITEM_FIELD_BY_KIND[kind];
  if (!itemField) return null;
  const objectId = String(data?.objectId || "").trim();
  const itemName = String(data?.[itemField] || "").trim();
  if (!objectId || !itemName) return null;
  const payload = data.payload ?? {};
  return {
    cacheKeys: getOverlayCacheKeys(objectId, itemName, payload),
    itemName,
    kind,
    objectId,
    payload
  };
}

export function applyOverlayPayload({ overlayCache, setHoverOverlay, update }) {
  if (!update) return false;
  update.cacheKeys.forEach((key) => overlayCache.current[update.kind].set(key, update.payload));
  setHoverOverlay((state) =>
    state
      && state.kind === update.kind
      && state.objectId === update.objectId
      && state.itemName === update.itemName
      ? { ...state, loading: false, payload: update.payload }
      : state
  );
  return true;
}

export function createOverlayPayloadHandler({ kind, overlayCache, setHoverOverlay }) {
  return (data) => applyOverlayPayload({
    overlayCache,
    setHoverOverlay,
    update: buildOverlayPayloadUpdate({ data, kind })
  });
}

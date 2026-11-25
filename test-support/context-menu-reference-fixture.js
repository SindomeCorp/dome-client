import profile from "./fixtures/context-menu-reference-profile.json" with { type: "json" };

// Explicit editable reference/selection fixture; the shipped Player profile is selection-only.
export const referenceContextMenus = () => structuredClone(profile);

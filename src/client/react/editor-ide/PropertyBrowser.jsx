import React from "react";
import { formatObjectPermissions } from "./payloads.js";

export function PropertyBrowser({
  collapsedProperties,
  onEditProperty,
  onLoadProps,
  onToggleCollapsed,
  propertyGraph,
  propertyObjectMeta
}) {
  return (
    <div className="property-browser-pane w-full h-full bg-bg-sunken text-ink p-4 overflow-auto">
      <div className="max-w-7xl">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Property Browser</h2>
          <p className="text-base text-ink-muted">Loaded objects and properties for quick navigation.</p>
        </div>
      </div>
      <div className="max-w-7xl">
        {Object.keys(propertyGraph).length === 0 ? (
          <div className="rounded-md border border-line-subtle bg-bg-surface p-4 text-ink-muted">No objects yet.</div>
        ) : (
          Object.entries(propertyGraph)
            .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
            .map(([objectId, properties]) => (
              <PropertySection
                key={objectId}
                collapsed={collapsedProperties[objectId] ?? true}
                meta={propertyObjectMeta[objectId] || {}}
                objectId={objectId}
                onEditProperty={onEditProperty}
                onLoadProps={onLoadProps}
                onToggleCollapsed={onToggleCollapsed}
                properties={properties}
              />
            ))
        )}
      </div>
    </div>
  );
}

function PropertySection({
  collapsed,
  meta,
  objectId,
  onEditProperty,
  onLoadProps,
  onToggleCollapsed,
  properties
}) {
  const permissionsText = formatObjectPermissions(meta.flags) || "none";
  const objectLabel = meta.name ? `${meta.name} (${objectId})` : objectId;
  const summary = `${objectLabel} | Owner: ${meta.owner || "none"} | Parent: ${meta.parent || "none"} | Permissions: ${permissionsText}`;

  return (
    <section className="mb-4 rounded-md border border-line-subtle bg-bg-surface p-3">
      <div className="flex items-center gap-3 mb-1">
        <button
          type="button"
          className="text-ink-muted hover:text-ink font-semibold"
          onClick={() => onToggleCollapsed(objectId)}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${objectId}`}
        >
          {collapsed ? "[+]" : "[-]"} {summary}
        </button>
        <button
          type="button"
          className="text-sm text-brand-600 hover:text-brand-500 hover:underline"
          onClick={() => onLoadProps(objectId)}
        >
          load props
        </button>
      </div>
      {!collapsed && (
        <div className="mt-2 space-y-1 text-lg">
          <div className="rounded-sm bg-bg-canvas/40 px-2 py-1 text-sm text-ink-muted">
            <div className="grid grid-cols-[minmax(12rem,2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)] gap-3 items-start font-semibold">
              <span>Prop name</span>
              <span>Is Clear</span>
              <span>Owner</span>
              <span>Perms</span>
            </div>
          </div>
          {properties.map((property, idx) => (
            <PropertyRow
              key={`${objectId}.${property.propertyName}`}
              idx={idx}
              objectId={objectId}
              onEditProperty={onEditProperty}
              property={property}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PropertyRow({
  idx,
  objectId,
  onEditProperty,
  property
}) {
  const rowBgClass = idx % 2 === 0
    ? "bg-bg-canvas/85"
    : "bg-bg-sunken/85 border border-line-subtle/60";

  return (
    <div className={`rounded-sm ${rowBgClass} px-2 py-1`}>
      <div className="grid grid-cols-[minmax(12rem,2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)] gap-3 items-start">
        <button
          type="button"
          className="text-left text-lg text-yellow-300 hover:text-yellow-200 no-underline hover:underline"
          onClick={() => onEditProperty(objectId, property.propertyName)}
        >
          {property.propertyName}
        </button>
        <span className="text-ink-muted">{property.clear ? "clear" : ""}</span>
        <span className="text-ink-muted">{property.owner || ""}</span>
        <span className="text-ink-muted">{property.permissions || ""}</span>
      </div>
    </div>
  );
}

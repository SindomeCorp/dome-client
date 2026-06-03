import React from "react";

export function ObjectBrowser({
  collapsedObjects,
  objectGraph,
  onEditVerb,
  onLoadVerbs,
  onToggleCollapsed
}) {
  return (
    <div className="object-browser-pane w-full h-full bg-bg-sunken text-ink p-4 overflow-auto">
      <div className="max-w-7xl">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Object Browser</h2>
          <p className="text-base text-ink-muted">Loaded objects and verbs for quick navigation.</p>
        </div>
      </div>
      <div className="max-w-7xl">
        {Object.keys(objectGraph).length === 0 ? (
          <div className="rounded-md border border-line-subtle bg-bg-surface p-4 text-ink-muted">No objects yet.</div>
        ) : (
          Object.entries(objectGraph)
            .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
            .map(([objectId, verbs]) => (
              <ObjectVerbSection
                key={objectId}
                collapsed={collapsedObjects[objectId] ?? true}
                objectId={objectId}
                onEditVerb={onEditVerb}
                onLoadVerbs={onLoadVerbs}
                onToggleCollapsed={onToggleCollapsed}
                verbs={verbs}
              />
            ))
        )}
      </div>
    </div>
  );
}

function ObjectVerbSection({
  collapsed,
  objectId,
  onEditVerb,
  onLoadVerbs,
  onToggleCollapsed,
  verbs
}) {
  return (
    <section className="mb-4 rounded-md border border-line-subtle bg-bg-surface p-3">
      <div className="flex items-center gap-3 mb-1">
        <button
          type="button"
          className="text-ink-muted hover:text-ink font-semibold"
          onClick={() => onToggleCollapsed(objectId)}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${objectId}`}
        >
          {collapsed ? "[+]" : "[-]"} {objectId}
        </button>
        <button
          type="button"
          className="text-sm text-brand-600 hover:text-brand-500 hover:underline"
          onClick={() => onLoadVerbs(objectId)}
        >
          Load Verbs
        </button>
      </div>
      {!collapsed && (
        <div className="mt-2 space-y-1 text-lg">
          <div className="rounded-sm bg-bg-canvas/40 px-2 py-1 text-sm text-ink-muted">
            <div className="grid grid-cols-[minmax(12rem,2fr)_minmax(10rem,2fr)_minmax(8rem,1fr)_minmax(7rem,1fr)_minmax(18rem,3fr)] gap-3 items-start font-semibold">
              <span>Verb</span>
              <span>Args</span>
              <span>Owner</span>
              <span>Perms</span>
              <span>Last Updated</span>
            </div>
          </div>
          {verbs.map((verb, idx) => (
            <ObjectVerbRow
              key={`${objectId}:${verb.verbName}`}
              idx={idx}
              objectId={objectId}
              onEditVerb={onEditVerb}
              verb={verb}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ObjectVerbRow({
  idx,
  objectId,
  onEditVerb,
  verb
}) {
  const aliases = String(verb.verbName || "").trim().split(/\s+/).filter(Boolean);
  const primaryAlias = aliases[0] || "";
  const extraAliases = aliases.slice(1);
  const rowBgClass = idx % 2 === 0
    ? "bg-bg-canvas/85"
    : "bg-bg-sunken/85 border border-line-subtle/60";

  return (
    <div className={`rounded-sm ${rowBgClass} px-2 py-1`}>
      <div className="grid grid-cols-[minmax(12rem,2fr)_minmax(10rem,2fr)_minmax(8rem,1fr)_minmax(7rem,1fr)_minmax(18rem,3fr)] gap-3 items-start">
        <button
          type="button"
          className="text-left text-lg text-yellow-300 hover:text-yellow-200 no-underline hover:underline"
          onClick={() => onEditVerb(objectId, primaryAlias)}
        >
          {primaryAlias}
        </button>
        <span className="text-ink-muted">{verb.argumentsText || "none"}</span>
        <span className="text-ink-muted">{verb.owner || "none"}</span>
        <span className="text-ink-muted">{verb.permissions || "none"}</span>
        <span className="text-ink-muted">{verb.lastUpdated || "none"}</span>
      </div>
      {extraAliases.map((alias) => (
        <div
          key={`${objectId}:${verb.verbName}:${alias}`}
          className="mt-1 pl-3 text-lg text-yellow-100"
        >
          ^ {alias}
        </div>
      ))}
    </div>
  );
}

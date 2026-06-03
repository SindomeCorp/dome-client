import React from "react";
import { isBrowserTab } from "./tabs.js";

export function TabStrip({
  active,
  onActivate,
  onClose,
  orientation,
  tabs
}) {
  return (
    <div
      className={`${
        orientation === "left"
          ? "w-[clamp(14rem,24vw,28rem)] flex-none h-full overflow-y-auto border-r border-line-subtle bg-bg-sunken"
          : "flex-none whitespace-nowrap overflow-x-auto border-b border-line-subtle bg-bg-sunken -mb-px"
      }`}
      role="tablist"
      aria-orientation={orientation === "left" ? "vertical" : "horizontal"}
    >
      <div className={`flex ${orientation === "left" ? "flex-col" : "items-end gap-2 px-3 py-2"}`}>
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            active={active}
            onActivate={onActivate}
            onClose={onClose}
            orientation={orientation}
            tab={tab}
          />
        ))}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onActivate,
  onClose,
  orientation,
  tab
}) {
  const dirty = tab.dirty;
  const isActive = active === tab.id;
  const isProgramTab = tab.command === "@program";
  const baseTab =
    "relative pr-9 group flex items-center gap-2 px-3 py-2 text-sm sm:text-base rounded-md border transition";
  const activeStyles = "bg-bg-surface shadow-sm border-line-strong";
  const inactiveStyles = "border-line-subtle hover:bg-bg-sunken";
  const programOutline = isProgramTab ? "border-b-2 border-b-yellow-300" : "";
  const labelClass = orientation === "left" ? "truncate" : "truncate max-w-[16rem]";
  const roundedClass = orientation === "left" ? "" : "rounded-t-md";

  return (
    <div
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      className={`${baseTab} ${roundedClass} ${isActive ? activeStyles : inactiveStyles} ${programOutline}`}
      onClick={() => onActivate(tab.id)}
      title={tab.title}
    >
      <div className="absolute left-0 bottom-full mb-1 z-30 hidden group-hover:block pointer-events-none">
        <div className="px-2 py-1 rounded bg-ink text-ink-invert text-sm shadow-card whitespace-nowrap">
          {tab.title}
        </div>
      </div>

      <svg className="w-5 h-5 text-ink-muted group-hover:text-ink" />
      <span className={labelClass}>{tab.title}{dirty ? " *" : ""}</span>

      {!isBrowserTab(tab) && (
        <span
          className={`ml-auto mr-8 inline-block rounded-full w-[0.9em] h-[0.9em] ${
            dirty ? "bg-warn-500" : "bg-ok-500"
          }`}
          aria-hidden="true"
        />
      )}

      <button
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded hover:bg-bg-sunken text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
        title="Close tab (⌘/Ctrl+E)"
        aria-label={`Close ${tab.title}`}
      >
        ×
      </button>
    </div>
  );
}

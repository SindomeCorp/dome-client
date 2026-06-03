import { useEffect, useRef } from "react";

export function getFallbackTabId(recentTabIds, tabs) {
  return [...recentTabIds].reverse().find((tabId) => tabs.some((tab) => tab.id === tabId))
    || tabs[0]?.id
    || null;
}

export function getNextActiveTabIdAfterClose({
  active,
  closedId,
  recentTabIds,
  tabs
}) {
  const nextTabs = tabs.filter((tab) => tab.id !== closedId);
  const nextRecentTabIds = recentTabIds.filter((tabId) => tabId !== closedId);
  if (active !== closedId) {
    return {
      nextActiveId: active,
      nextRecentTabIds,
      nextTabs
    };
  }
  return {
    nextActiveId: getFallbackTabId(nextRecentTabIds, nextTabs),
    nextRecentTabIds,
    nextTabs
  };
}

export function useRecentTabs({ active, dispatchIde, tabs }) {
  const recentTabIds = useRef([]);

  useEffect(() => {
    if (!active) return;
    recentTabIds.current = [...recentTabIds.current.filter((id) => id !== active), active];
  }, [active]);

  useEffect(() => {
    if (active == null) return;
    if (tabs.some((tab) => tab.id === active)) return;
    dispatchIde({ type: "activateTab", id: getFallbackTabId(recentTabIds.current, tabs) });
  }, [active, dispatchIde, tabs]);

  const getCloseState = (closedId) => {
    const closeState = getNextActiveTabIdAfterClose({
      active,
      closedId,
      recentTabIds: recentTabIds.current,
      tabs
    });
    recentTabIds.current = closeState.nextRecentTabIds;
    return closeState;
  };

  return { getCloseState };
}

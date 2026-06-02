export const wireHistorySearchOverlay = ({
  document,
  inputReader,
  historySource,
  onSelect
}) => {
  const historySearchOverlay = document.querySelector("#history-search-overlay");
  const historySearchQuery = document.querySelector("#history-search-query");
  const historySearchResults = document.querySelector("#history-search-results");
  const historySearchEmpty = document.querySelector("#history-search-empty");
  const historySearchClose = document.querySelector("#button-history-search-close");
  let historySearchOpen = false;
  let historySearchMatches = [];
  let historySearchActiveIndex = -1;

  const closeHistorySearch = ({ focusInput = true } = {}) => {
    if (!historySearchOverlay) {
      return;
    }
    historySearchOpen = false;
    historySearchMatches = [];
    historySearchActiveIndex = -1;
    historySearchOverlay.classList.add("hide");
    if (focusInput) {
      inputReader.focus();
    }
  };

  const commitHistorySearchSelection = () => {
    if (!historySearchOpen || historySearchActiveIndex < 0) {
      return false;
    }
    const selected = historySearchMatches[historySearchActiveIndex];
    if (typeof selected !== "string") {
      return false;
    }
    onSelect(selected);
    closeHistorySearch({ focusInput: true });
    const end = inputReader.value.length;
    if ("selectionStart" in inputReader) {
      inputReader.selectionStart = end;
      inputReader.selectionEnd = end;
    }
    return true;
  };

  const renderHistorySearchResults = () => {
    if (!historySearchResults || !historySearchEmpty) {
      return;
    }
    historySearchResults.innerHTML = "";
    const hasMatches = historySearchMatches.length > 0;
    historySearchEmpty.classList.toggle("hide", hasMatches);
    if (!hasMatches) {
      return;
    }
    let activeItem = null;
    historySearchMatches.forEach((entry, index) => {
      const item = document.createElement("li");
      item.className = "history-search-item";
      item.textContent = entry;
      if (index === historySearchActiveIndex) {
        item.classList.add("active");
        item.setAttribute("aria-selected", "true");
        activeItem = item;
      }
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      item.addEventListener("click", () => {
        historySearchActiveIndex = index;
        commitHistorySearchSelection();
      });
      historySearchResults.appendChild(item);
    });
    if (activeItem && typeof activeItem.scrollIntoView === "function") {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  };

  const applyHistorySearchQuery = () => {
    if (!historySearchQuery) {
      return;
    }
    const needle = historySearchQuery.value.trim().toLowerCase();
    const uniqueMatches = [];
    const seen = new Set();
    historySource().forEach((entry) => {
      const normalized = String(entry);
      if (needle !== "" && !normalized.toLowerCase().includes(needle)) {
        return;
      }
      if (seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      uniqueMatches.push(normalized);
    });
    historySearchMatches = uniqueMatches;
    historySearchActiveIndex = historySearchMatches.length > 0 ? 0 : -1;
    renderHistorySearchResults();
  };

  const moveHistorySearchActive = (delta) => {
    if (!historySearchMatches.length) {
      return;
    }
    const max = historySearchMatches.length - 1;
    historySearchActiveIndex = Math.max(0, Math.min(max, historySearchActiveIndex + delta));
    renderHistorySearchResults();
  };

  const openHistorySearch = () => {
    if (!historySearchOverlay || !historySearchQuery) {
      return;
    }
    historySearchOpen = true;
    historySearchOverlay.classList.remove("hide");
    historySearchQuery.value = "";
    applyHistorySearchQuery();
    historySearchQuery.focus();
    historySearchQuery.select();
  };

  if (historySearchOverlay) {
    historySearchOverlay.addEventListener("click", (event) => {
      if (event.target === historySearchOverlay) {
        closeHistorySearch({ focusInput: true });
      }
    });
  }
  if (historySearchClose) {
    historySearchClose.addEventListener("click", () => {
      closeHistorySearch({ focusInput: true });
    });
  }
  if (historySearchQuery) {
    historySearchQuery.addEventListener("input", () => {
      applyHistorySearchQuery();
    });
    historySearchQuery.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveHistorySearchActive(-1);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveHistorySearchActive(1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commitHistorySearchSelection();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeHistorySearch({ focusInput: true });
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && historySearchOpen) {
      event.preventDefault();
      closeHistorySearch({ focusInput: true });
      return;
    }
    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.key.toLowerCase() !== "r") {
      return;
    }
    if (historySearchOpen) {
      // Let browser default behavior run when Ctrl+R is pressed again.
      return;
    }
    event.preventDefault();
    openHistorySearch();
  });

  return {
    close: closeHistorySearch,
    open: openHistorySearch
  };
};

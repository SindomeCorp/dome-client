function setupTabGroup(root, tabSelector, panelSelector, tabKey, panelKey) {
  const tabs = Array.from(root.querySelectorAll(tabSelector));
  if (tabs.length === 0) return;
  const activate = (tabName) => {
    tabs.forEach((tab) => {
      const active = tab.dataset[tabKey] === tabName;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.setAttribute("tabindex", active ? "0" : "-1");
    });
    root.querySelectorAll(panelSelector).forEach((panel) => {
      panel.classList.toggle("hide", panel.dataset[panelKey] !== tabName);
    });
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab.dataset[tabKey]));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      let nextIndex = index;
      if (event.key === "ArrowLeft") nextIndex = index === 0 ? tabs.length - 1 : index - 1;
      if (event.key === "ArrowRight") nextIndex = index === tabs.length - 1 ? 0 : index + 1;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      const nextTab = tabs[nextIndex];
      activate(nextTab.dataset[tabKey]);
      nextTab.focus();
    });
  });
  const activeTab = tabs.find((tab) => tab.classList.contains("active")) ?? tabs[0];
  activate(activeTab.dataset[tabKey]);
}

function setupClientOptionsTabs({ root = document, presentation = false } = {}) {
  if (!presentation) {
    setupTabGroup(root, ".client-options-tab", ".client-options-panel", "tab", "tabPanel");
    setupTabGroup(root, ".context-menu-tab", "[data-context-panel]", "contextTab", "contextPanel");
  }
  setupTabGroup(root, ".presentation-tab", "[data-presentation-panel]", "presentationTab", "presentationPanel");
}

export {
  setupClientOptionsTabs
};

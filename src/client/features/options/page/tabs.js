function activateClientOptionsTab(tabName, { root = document, presentation = false } = {}) {
  root.querySelectorAll(presentation ? ".presentation-tab" : ".client-options-tab").forEach((tab) => {
    const active = (presentation ? tab.dataset.presentationTab : tab.dataset.tab) === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.setAttribute("tabindex", active ? "0" : "-1");
  });

  root.querySelectorAll(presentation ? "[data-presentation-panel]" : ".client-options-panel").forEach((panel) => {
    panel.classList.toggle("hide", (presentation ? panel.dataset.presentationPanel : panel.dataset.tabPanel) !== tabName);
  });
}

function setupClientOptionsTabs({ root = document, presentation = false } = {}) {
  const tabs = Array.from(root.querySelectorAll(presentation ? ".presentation-tab" : ".client-options-tab"));
  if (tabs.length === 0) return;

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      activateClientOptionsTab(presentation ? tab.dataset.presentationTab : tab.dataset.tab, { root, presentation });
    });
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
      activateClientOptionsTab(presentation ? nextTab.dataset.presentationTab : nextTab.dataset.tab, { root, presentation });
      nextTab.focus();
    });
  });

  const activeTab = tabs.find((tab) => tab.classList.contains("active")) ?? tabs[0];
  activateClientOptionsTab(presentation ? activeTab.dataset.presentationTab : activeTab.dataset.tab, { root, presentation });
  if (!presentation) setupClientOptionsTabs({ root, presentation: true });
}

export {
  setupClientOptionsTabs
};

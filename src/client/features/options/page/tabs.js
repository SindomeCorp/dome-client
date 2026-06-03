function activateClientOptionsTab(tabName, { root = document } = {}) {
  root.querySelectorAll(".client-options-tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.setAttribute("tabindex", active ? "0" : "-1");
  });

  root.querySelectorAll(".client-options-panel").forEach((panel) => {
    panel.classList.toggle("hide", panel.dataset.tabPanel !== tabName);
  });
}

function setupClientOptionsTabs({ root = document } = {}) {
  const tabs = Array.from(root.querySelectorAll(".client-options-tab"));
  if (tabs.length === 0) return;

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      activateClientOptionsTab(tab.dataset.tab, { root });
    });
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === "ArrowLeft") nextIndex = index === 0 ? tabs.length - 1 : index - 1;
      if (event.key === "ArrowRight") nextIndex = index === tabs.length - 1 ? 0 : index + 1;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      const nextTab = tabs[nextIndex];
      activateClientOptionsTab(nextTab.dataset.tab, { root });
      nextTab.focus();
    });
  });

  const activeTab = tabs.find((tab) => tab.classList.contains("active")) ?? tabs[0];
  activateClientOptionsTab(activeTab.dataset.tab, { root });
}

export {
  setupClientOptionsTabs
};

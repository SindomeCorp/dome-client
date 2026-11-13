// Keep one set of controls and listeners as the main pane changes size. Measure
// the expanded labels separately so collapsing cannot cause a resize loop.
export function setupOutputToolbar(manager) {
  const { doc, win } = manager;
  const toolbar = doc.querySelector(".mini-controls");
  if (!toolbar) return { refresh() {}, resize() {}, destroy() {} };
  const main = doc.querySelector("#output-main-panel");
  const secondaryHeader = doc.querySelector("#output-secondary-panel header");
  const input = doc.querySelector(".input-buffer-row");
  let expandedWidth = 0;
  let frame;
  function measure() {
    const clone = toolbar.cloneNode(true);
    const split = clone.querySelector("#button-output-split");
    if (split) split.textContent = "CLOSE SPLIT";
    const pauseLabel = clone.querySelector("#button-auto-scroll .hidden-xs");
    if (pauseLabel) pauseLabel.textContent = "RESUME SCROLL";
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    clone.className = "mini-controls output-toolbar-measure";
    clone.setAttribute("aria-hidden", "true");
    clone.inert = true;
    doc.body.append(clone);
    expandedWidth = clone.getBoundingClientRect().width;
    clone.remove();
  }
  function refresh() {
    frame = null;
    const narrow = win.matchMedia?.("(max-width: 767px)").matches === true;
    const compact = narrow || main.clientWidth < expandedWidth + 24;
    toolbar.classList.toggle("compact-controls", compact);
    if (compact) {
      if (toolbar.parentElement !== manager.workspace.parentElement) input.before(toolbar);
    } else if (toolbar.parentElement !== main) main.prepend(toolbar);
    if (secondaryHeader) {
      manager.workspace.style.setProperty("--secondary-header-height", Math.max(32, secondaryHeader.getBoundingClientRect().height) + "px");
    }
  }
  function schedule() {
    if (frame == null) frame = win.requestAnimationFrame(refresh);
  }
  measure();
  refresh();
  const observer = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  observer?.observe(main);
  if (secondaryHeader) observer?.observe(secondaryHeader);
  win.addEventListener("resize", schedule);
  let destroyed = false;
  doc.fonts?.ready.then(() => { if (!destroyed) { measure(); schedule(); } });
  return {
    refresh: schedule,
    resize() { measure(); schedule(); },
    destroy() {
      destroyed = true;
      observer?.disconnect();
      win.removeEventListener("resize", schedule);
      if (frame != null) win.cancelAnimationFrame(frame);
    }
  };
}

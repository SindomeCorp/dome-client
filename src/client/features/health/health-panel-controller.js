export function createHealthPanelController({
  healthDisplay,
  healthDetail,
  setTimeoutFn = (...args) => globalThis.setTimeout(...args),
  clearTimeoutFn = (...args) => globalThis.clearTimeout(...args)
} = {}) {
  let showingGameHealth = false;
  let clickedOpen = false;
  let detailAnimation = null;
  let hideTimeout = null;
  let overHealthArea = false;
  const animationTimeouts = new Set();

  const cancelHide = () => {
    if (hideTimeout) {
      clearTimeoutFn(hideTimeout);
      hideTimeout = null;
    }
  };

  const isInHealthArea = target => (
    target && (healthDetail.contains(target) || healthDisplay.contains(target))
  );

  const animateDetail = (frames) => {
    if (detailAnimation) {
      detailAnimation.cancel();
    }
    detailAnimation = healthDetail.animate(frames, { duration: 250, fill: "forwards" });
  };

  const showPanel = () => {
    cancelHide();
    if (showingGameHealth) {
      return;
    }
    showingGameHealth = true;
    const timeout = setTimeoutFn(() => {
      animationTimeouts.delete(timeout);
      if (!showingGameHealth) {
        return;
      }
      animateDetail([
        { left: "-152px" },
        { left: "0px" }
      ]);
    }, 25);
    animationTimeouts.add(timeout);
  };

  const hidePanel = () => {
    if (clickedOpen || !showingGameHealth) {
      return;
    }
    cancelHide();
    showingGameHealth = false;
    const timeout = setTimeoutFn(() => {
      animationTimeouts.delete(timeout);
      if (showingGameHealth) {
        return;
      }
      animateDetail([
        { left: "0px" },
        { left: "-152px" }
      ]);
    }, 25);
    animationTimeouts.add(timeout);
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimeout = setTimeoutFn(() => {
      if (!overHealthArea) {
        hidePanel();
      }
      hideTimeout = null;
    }, 500);
  };

  const handleHealthMouseOver = () => {
    overHealthArea = true;
    cancelHide();
    showPanel();
  };

  const handleHealthMouseLeave = e => {
    overHealthArea = isInHealthArea(e.relatedTarget);
    if (!overHealthArea) {
      scheduleHide();
    }
  };

  const togglePanel = () => {
    if (showingGameHealth && clickedOpen) {
      clickedOpen = false;
      hidePanel();
      return;
    }

    clickedOpen = true;
    showPanel();
  };

  healthDisplay.addEventListener("mouseover", handleHealthMouseOver);
  healthDisplay.addEventListener("mouseleave", handleHealthMouseLeave);
  healthDetail.addEventListener("mouseover", handleHealthMouseOver);
  healthDetail.addEventListener("mouseleave", handleHealthMouseLeave);
  healthDetail.addEventListener("click", togglePanel);

  const destroy = () => {
    cancelHide();
    for (const timeout of animationTimeouts) {
      clearTimeoutFn(timeout);
    }
    animationTimeouts.clear();
    healthDisplay.removeEventListener("mouseover", handleHealthMouseOver);
    healthDisplay.removeEventListener("mouseleave", handleHealthMouseLeave);
    healthDetail.removeEventListener("mouseover", handleHealthMouseOver);
    healthDetail.removeEventListener("mouseleave", handleHealthMouseLeave);
    healthDetail.removeEventListener("click", togglePanel);
  };

  return {
    destroy,
    hidePanel,
    showPanel,
    togglePanel
  };
}

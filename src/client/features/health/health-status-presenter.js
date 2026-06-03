export function createHealthStatusPresenter({
  statusDisplay,
  animate = (elem, frames, options) => elem.animate(frames, options)
} = {}) {
  let fadeAnimation = null;

  const showStatus = (message, { persist = false } = {}) => {
    if (!statusDisplay) {
      return;
    }

    statusDisplay.innerHTML = String(message ?? "").toUpperCase();
    if (fadeAnimation) {
      fadeAnimation.cancel();
    }

    fadeAnimation = animate(statusDisplay, [
      { opacity: 0 },
      { opacity: 1 }
    ], { duration: 500, fill: "forwards" });
    const currentAnimation = fadeAnimation;

    if (persist) {
      currentAnimation.finished.catch(() => {});
      return;
    }

    currentAnimation.finished.then(() => {
      if (fadeAnimation !== currentAnimation) {
        return;
      }
      fadeAnimation = animate(statusDisplay, [
        { opacity: 1 },
        { opacity: 0 }
      ], { delay: 5000, duration: 1000, fill: "forwards" });
    }).catch(() => {});
  };

  return {
    showStatus
  };
}

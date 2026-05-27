import { dome } from "./b-variables.js";

const BOTTOM_THRESHOLD_PX = 24;

const isAtBottom = (buffer) => {
  return buffer.scrollHeight - buffer.scrollTop - buffer.clientHeight <= BOTTOM_THRESHOLD_PX;
};

const setScrollBuffer = dome => {
  dome.scrollBuffer = () => {
    if (dome.pauseBuffer) {
      dome.pausedLines++;
      if (dome.setFadeText && dome.statusDisplay) {
        dome.setFadeText(dome.statusDisplay, `${dome.pausedLines} UNREAD LINES`);
      }
    } else {
      dome._autoScrollProgrammatic = true;
      dome.buffer.scrollTop = dome.buffer.scrollHeight;
      Promise.resolve().then(() => {
        dome._autoScrollProgrammatic = false;
      });
    }
  };
};

const pauseIconMarkup = "<span class=\"mini-glyph\" aria-hidden=\"true\"><svg class=\"mini-glyph-svg\" viewBox=\"0 0 14 14\" focusable=\"false\" aria-hidden=\"true\"><rect x=\"2\" y=\"2\" width=\"3.5\" height=\"10\" rx=\"0.9\"></rect><rect x=\"8.5\" y=\"2\" width=\"3.5\" height=\"10\" rx=\"0.9\"></rect></svg></span>";
const playIconMarkup = "<span class=\"mini-glyph\" aria-hidden=\"true\"><svg class=\"mini-glyph-svg\" viewBox=\"0 0 14 14\" focusable=\"false\" aria-hidden=\"true\"><path d=\"M3 2.2L11.5 7L3 11.8Z\"></path></svg></span>";

const setPauseUi = (dome, paused) => {
  const button = dome.scrollButton;
  if (paused) {
    dome.buffer.classList.add("scroll-disabled");
    if (button) {
      button.innerHTML = `${playIconMarkup}<span class="hidden-xs">RESUME SCROLL</span>`;
      button.classList.add("btn-danger");
      button.classList.remove("btn-primary");
    }
  } else {
    dome.buffer.classList.remove("scroll-disabled");
    if (button) {
      button.innerHTML = `${pauseIconMarkup}<span class="hidden-xs">PAUSE SCROLL</span>`;
      button.classList.add("btn-primary");
      button.classList.remove("btn-danger");
    }
  }
};

const setPaused = (dome, paused, message = null) => {
  if (dome.pauseBuffer === paused) {
    return;
  }
  dome.pauseBuffer = paused;
  if (!paused) {
    dome.pausedLines = 0;
  }
  if (message && dome.setFadeText) {
    dome.setFadeText(dome.statusDisplay, message);
  }
  setPauseUi(dome, paused);
};

export function setupAutoscroll(dome, win = window) {

  // remove previous bindings
  if (dome._autoScrollPosition) {
    dome.buffer.removeEventListener("scroll", dome._autoScrollPosition);
    dome._autoScrollPosition = null;
  }
  if (dome._autoScrollDbl) {
    dome.buffer.removeEventListener("dblclick", dome._autoScrollDbl);
    dome._autoScrollDbl = null;
  }
  if (dome._autoScrollDown) {
    dome.buffer.removeEventListener("mousedown", dome._autoScrollDown);
    dome._autoScrollDown = null;
  }
  if (dome._autoScrollUp) {
    dome.buffer.removeEventListener("mouseup", dome._autoScrollUp);
    dome._autoScrollUp = null;
  }
  if (dome._longClickTimeout != null) {
    win.clearTimeout(dome._longClickTimeout);
    dome._longClickTimeout = null;
  }

  dome.pauseBuffer = false;
  dome.pausedLines = 0;

  setScrollBuffer(dome);

  dome._longClickTimeout = null;
  dome.onToggleAutoScroll = () => {
    dome._longClickTimeout = null;
    if (dome.pauseBuffer) {
      setPaused(dome, false, "SCROLLING RESUMED");
      dome._autoScrollProgrammatic = true;
      dome.buffer.scrollTop = dome.buffer.scrollHeight;
      Promise.resolve().then(() => {
        dome._autoScrollProgrammatic = false;
      });
      document.querySelector("#inputBuffer").focus();
    } else {
      setPaused(dome, true, "SCROLLING PAUSED");
      document.querySelector("#lineBuffer").focus();
    }
  };

  if (dome.preferences.scrollUpToPause !== false) {
    dome._autoScrollPosition = () => {
      if (dome._autoScrollProgrammatic) {
        return;
      }
      if (isAtBottom(dome.buffer)) {
        setPaused(dome, false, "SCROLLING RESUMED");
        return;
      }
      setPaused(dome, true, "SCROLLING PAUSED");
    };
    dome.buffer.addEventListener("scroll", dome._autoScrollPosition);
  }

  if (dome.preferences.autoScroll === "dbl") {
    dome._autoScrollDbl = (e) => {
      // Only suppress browser text-selection behavior for the specific
      // double-click gesture that toggles autoscroll.
      e?.preventDefault?.();
      dome.onToggleAutoScroll();
    };
    dome.buffer.addEventListener("dblclick", dome._autoScrollDbl);
  } else if (dome.preferences.autoScroll === "long") {
    dome._autoScrollDown = () => {
      dome._longClickTimeout = win.setTimeout(dome.onToggleAutoScroll, 2000);
    };
    dome._autoScrollUp = () => {
      if (dome._longClickTimeout != null) {
        win.clearTimeout(dome._longClickTimeout);
      }
      dome._longClickTimeout = null;
    };
    dome.buffer.addEventListener("mousedown", dome._autoScrollDown);
    dome.buffer.addEventListener("mouseup", dome._autoScrollUp);
  } else if (dome.preferences.autoScroll === "none") {
    // no mouse bindings
  }
}

setScrollBuffer(dome);
dome.setupAutoscroll = () => {
  setupAutoscroll(dome, window);
};

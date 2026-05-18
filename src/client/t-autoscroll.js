import { dome } from "./b-variables.js";

const setScrollBuffer = dome => {
  dome.scrollBuffer = () => {
    if (dome.pauseBuffer) {
      dome.pausedLines++;
      if (dome.setFadeText && dome.statusDisplay) {
        dome.setFadeText(dome.statusDisplay, `${dome.pausedLines} UNREAD LINES`);
      }
    } else {
      dome.buffer.scrollTop = dome.buffer.scrollHeight;
    }
  };
};

export function setupAutoscroll(dome, win = window) {

  // remove previous bindings
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
    const button = dome.scrollButton;
    if (dome.pauseBuffer) {
      dome.pauseBuffer = false;
      dome.pausedLines = 0;
      if (dome.setFadeText) {
        dome.setFadeText(dome.statusDisplay, "SCROLLING RESUMED");
      }
      dome.buffer.scrollTop = dome.buffer.scrollHeight;
      dome.buffer.classList.remove("scroll-disabled");
      button.innerHTML = "<i class=\"icon-pause icon-white\"></i><span class=\"hidden-xs\">PAUSE SCROLL</span>";
      button.classList.add("btn-primary");
      button.classList.remove("btn-danger");
      document.querySelector("#inputBuffer").focus();
    } else {
      dome.pauseBuffer = true;
      if (dome.setFadeText) {
        dome.setFadeText(dome.statusDisplay, "SCROLLING PAUSED");
      }
      dome.buffer.classList.add("scroll-disabled");
      button.innerHTML = "<i class=\"icon-play icon-white\"></i><span class=\"hidden-xs\">RESUME SCROLL</span>";
      button.classList.add("btn-danger");
      button.classList.remove("btn-primary");
      document.querySelector("#lineBuffer").focus();
    }
  };

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

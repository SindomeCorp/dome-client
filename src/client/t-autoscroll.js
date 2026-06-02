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

export function setupAutoscroll(context = dome, winArg = window) {
  const client = context?.buffer ? context : context.client;
  const win = context?.buffer ? winArg : context.win ?? window;
  const doc = context?.buffer ? win.document ?? globalThis.document : context.doc ?? win.document ?? globalThis.document;

  // remove previous bindings
  if (client._autoScrollPosition) {
    client.buffer.removeEventListener("scroll", client._autoScrollPosition);
    client._autoScrollPosition = null;
  }
  if (client._autoScrollDbl) {
    client.buffer.removeEventListener("dblclick", client._autoScrollDbl);
    client._autoScrollDbl = null;
  }
  if (client._autoScrollDown) {
    client.buffer.removeEventListener("mousedown", client._autoScrollDown);
    client._autoScrollDown = null;
  }
  if (client._autoScrollUp) {
    client.buffer.removeEventListener("mouseup", client._autoScrollUp);
    client._autoScrollUp = null;
  }
  if (client._longClickTimeout != null) {
    win.clearTimeout(client._longClickTimeout);
    client._longClickTimeout = null;
  }

  client.pauseBuffer = false;
  client.pausedLines = 0;

  setScrollBuffer(client);

  client._longClickTimeout = null;
  client.onToggleAutoScroll = () => {
    client._longClickTimeout = null;
    if (client.pauseBuffer) {
      setPaused(client, false, "SCROLLING RESUMED");
      client._autoScrollProgrammatic = true;
      client.buffer.scrollTop = client.buffer.scrollHeight;
      Promise.resolve().then(() => {
        client._autoScrollProgrammatic = false;
      });
      doc.querySelector("#inputBuffer").focus();
    } else {
      setPaused(client, true, "SCROLLING PAUSED");
      doc.querySelector("#lineBuffer").focus();
    }
  };

  if (client.preferences.scrollUpToPause !== false) {
    client._autoScrollPosition = () => {
      if (client._autoScrollProgrammatic) {
        return;
      }
      if (isAtBottom(client.buffer)) {
        setPaused(client, false, "SCROLLING RESUMED");
        return;
      }
      setPaused(client, true, "SCROLLING PAUSED");
    };
    client.buffer.addEventListener("scroll", client._autoScrollPosition);
  }

  if (client.preferences.autoScroll === "dbl") {
    client._autoScrollDbl = (e) => {
      // Only suppress browser text-selection behavior for the specific
      // double-click gesture that toggles autoscroll.
      e?.preventDefault?.();
      client.onToggleAutoScroll();
    };
    client.buffer.addEventListener("dblclick", client._autoScrollDbl);
  } else if (client.preferences.autoScroll === "long") {
    client._autoScrollDown = () => {
      client._longClickTimeout = win.setTimeout(client.onToggleAutoScroll, 2000);
    };
    client._autoScrollUp = () => {
      if (client._longClickTimeout != null) {
        win.clearTimeout(client._longClickTimeout);
      }
      client._longClickTimeout = null;
    };
    client.buffer.addEventListener("mousedown", client._autoScrollDown);
    client.buffer.addEventListener("mouseup", client._autoScrollUp);
  } else if (client.preferences.autoScroll === "none") {
    // no mouse bindings
  }
}

setScrollBuffer(dome);
dome.setupAutoscroll = () => {
  setupAutoscroll({ client: dome });
};

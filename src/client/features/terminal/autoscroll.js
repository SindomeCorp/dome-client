const BOTTOM_THRESHOLD_PX = 24;

const isAtBottom = (buffer) => {
  return buffer.scrollHeight - buffer.scrollTop - buffer.clientHeight <= BOTTOM_THRESHOLD_PX;
};

const setScrollBuffer = client => {
  client.scrollBuffer = () => {
    if (client.pauseBuffer) {
      client.pausedLines++;
      client.health?.showStatus(`${client.pausedLines} UNREAD LINES`);
    } else {
      client._autoScrollProgrammatic = true;
      client.buffer.scrollTop = client.buffer.scrollHeight;
      Promise.resolve().then(() => {
        client._autoScrollProgrammatic = false;
      });
    }
  };
};

const pauseIconMarkup = "<span class=\"mini-glyph\" aria-hidden=\"true\"><svg class=\"mini-glyph-svg\" viewBox=\"0 0 14 14\" focusable=\"false\" aria-hidden=\"true\"><rect x=\"2\" y=\"2\" width=\"3.5\" height=\"10\" rx=\"0.9\"></rect><rect x=\"8.5\" y=\"2\" width=\"3.5\" height=\"10\" rx=\"0.9\"></rect></svg></span>";
const playIconMarkup = "<span class=\"mini-glyph\" aria-hidden=\"true\"><svg class=\"mini-glyph-svg\" viewBox=\"0 0 14 14\" focusable=\"false\" aria-hidden=\"true\"><path d=\"M3 2.2L11.5 7L3 11.8Z\"></path></svg></span>";

const setPauseUi = (client, paused) => {
  const button = client.scrollButton;
  if (paused) {
    client.buffer.classList.add("scroll-disabled");
    if (button) {
      button.innerHTML = `${playIconMarkup}<span class="hidden-xs">RESUME SCROLL</span>`;
      button.classList.add("btn-danger");
      button.classList.remove("btn-primary");
    }
  } else {
    client.buffer.classList.remove("scroll-disabled");
    if (button) {
      button.innerHTML = `${pauseIconMarkup}<span class="hidden-xs">PAUSE SCROLL</span>`;
      button.classList.add("btn-primary");
      button.classList.remove("btn-danger");
    }
  }
};

const setPaused = (client, paused, message = null) => {
  if (client.pauseBuffer === paused) {
    return;
  }
  client.pauseBuffer = paused;
  if (!paused) {
    client.pausedLines = 0;
  }
  if (message) {
    client.health?.showStatus(message);
  }
  setPauseUi(client, paused);
};

export function setupAutoscroll(context, winArg = window) {
  const client = context?.buffer ? context : context.client;
  const win = context?.buffer ? winArg : context.win ?? window;
  const doc = context?.buffer ? win.document ?? globalThis.document : context.doc ?? win.document ?? globalThis.document;
  const preferences = client.preferences ?? {};
  const canBindBuffer = client.buffer
    && typeof client.buffer.addEventListener === "function"
    && typeof client.buffer.removeEventListener === "function";

  // remove previous bindings
  if (canBindBuffer && client._autoScrollPosition) {
    client.buffer.removeEventListener("scroll", client._autoScrollPosition);
    client._autoScrollPosition = null;
  }
  if (canBindBuffer && client._autoScrollDbl) {
    client.buffer.removeEventListener("dblclick", client._autoScrollDbl);
    client._autoScrollDbl = null;
  }
  if (canBindBuffer && client._autoScrollDown) {
    client.buffer.removeEventListener("mousedown", client._autoScrollDown);
    client._autoScrollDown = null;
  }
  if (canBindBuffer && client._autoScrollUp) {
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
  if (!canBindBuffer) {
    return;
  }

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

  if (preferences.scrollUpToPause !== false) {
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

  if (preferences.autoScroll === "dbl") {
    client._autoScrollDbl = (e) => {
      // Only suppress browser text-selection behavior for the specific
      // double-click gesture that toggles autoscroll.
      e?.preventDefault?.();
      client.onToggleAutoScroll();
    };
    client.buffer.addEventListener("dblclick", client._autoScrollDbl);
  } else if (preferences.autoScroll === "long") {
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
  } else if (preferences.autoScroll === "none") {
    // no mouse bindings
  }
}

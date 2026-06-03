import { SOCKET_STATE_ENUM, defaultHeightOffset } from "../../core/constants.js";

export function setupWindowHandlers({
  client,
  win = globalThis.window,
  doc = globalThis.document,
  navigatorRef = globalThis.navigator,
  AudioCtor = globalThis.Audio
} = {}) {
  const AlertAudio = AudioCtor ?? win.Audio;

  client.alert = {
    tone       : new AlertAudio("/notice.wav"),
    pattern    : null,
    active     : false,
    titleProc  : null
  };

  const primeAlertTone = function() {
    if (!client.alert.tone) return;

    client.alert.tone.muted = true;
    const playAttempt = client.alert.tone.play();

    if (playAttempt?.then) {
      playAttempt.then(() => {
        client.alert.tone.pause();
        client.alert.tone.currentTime = 0;
        client.alert.tone.muted = false;
      }).catch(() => {
        client.alert.tone.muted = false;
      });
    } else {
      client.alert.tone.muted = false;
    }

    win.removeEventListener("pointerdown", primeAlertTone);
    win.removeEventListener("keydown", primeAlertTone);
    win.removeEventListener("touchstart", primeAlertTone);
  };

  client.urlPatterns = {
    images: /png|jpg|gif|jpeg$/,
    videos: /mp4|gifv$/,
    youtube: /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/
  };

  client.parseYouTubeID = function ( url ) {
    const match = url.match(client.urlPatterns.youtube);
    return (match&&match[7].length==11)? match[7] : false;
  };

  const onUnloadHandler = function() {
    if (client.socketState == SOCKET_STATE_ENUM.CONNECTED) client.socket?.emit("input", "@quit\r\n");
  };

  const onBeforeUnloadHandler = function(event) {
    if (client.socketState === SOCKET_STATE_ENUM.CONNECTED) {
      event.preventDefault();
      event.returnValue = "";
    }
  };

  const onFocusHandler = function() {
    client.alert.active = false;
    if (client.alert.titleProc != null) {
      win.clearInterval(client.alert.titleProc);
      client.alert.titleProc = null;
      doc.title = client.titleBarText;
    }
    if (client.inputReader) {
      client.inputReader.focus();
    }
  };

  client.setWindowTitle = function(newTitle) {
    doc.title = client.titleBarText = newTitle;
  };

  const onBlurHandler = function() {
    if (client.preferences.playDing) client.alert.active = true;
  };

  const onResizeHandler = function() {
    client.client.style.height = `${win.innerHeight}px`;
    client.buffer.style.height = `${win.innerHeight - defaultHeightOffset}px`;
  };

  const inViewport = function(elem) {
    const bounds = elem.getBoundingClientRect();
    return !(bounds.right < 0 ||
             bounds.left > win.innerWidth ||
             bounds.bottom < 0 ||
             bounds.top > win.innerHeight);
  };

  const onScrollHandler = function() {
    const shownImages = client.buffer.querySelectorAll(".shown-image");
    shownImages.forEach(image => {
      if (!inViewport(image)) {
        const imageId = image.id;
        const control = doc.getElementById(`b${imageId}`);
        if (control) {
          control.classList.remove("icon-chevron-down");
          control.classList.add("icon-chevron-up");
        }
        const span = client.buffer.querySelector(`span#s${imageId}`);
        if (span) span.innerHTML = "";
      }
    });
  };

  let titleAlerted = false;
  const alertTitle = function() {
    if (!titleAlerted) {
      doc.title = "!! " + client.titleBarText;
      titleAlerted=true;
    } else {
      doc.title = client.titleBarText;
      titleAlerted=false;
    }
  };

  client.windowAlert = function() {
    if (client.alert.titleProc != null) {
      return;
    }

    client.alert.titleProc = win.setInterval(alertTitle, 500);
  };


  // this is needed because the 'resize' event fires inappropriately in iOS
  const iOS = ( navigatorRef.userAgent.match(/(iPad|iPhone|iPod)/g) ? true : false );

  win.addEventListener("focus", onFocusHandler);
  win.addEventListener("blur", onBlurHandler);
  if (!iOS) {
    win.addEventListener("resize", onResizeHandler);
  }
  win.addEventListener("orientationchange", onResizeHandler);
  win.addEventListener("beforeunload", onBeforeUnloadHandler);
  win.addEventListener("unload", onUnloadHandler);
  client.buffer.addEventListener("scroll", onScrollHandler);

  win.addEventListener("pointerdown", primeAlertTone, { once: true });
  win.addEventListener("keydown", primeAlertTone, { once: true });
  win.addEventListener("touchstart", primeAlertTone, { once: true });

  onResizeHandler();
}

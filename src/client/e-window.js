import { dome, socket, SOCKET_STATE_ENUM, defaultHeightOffset } from "./b-variables.js";

dome.setupWindowHandlers = function() {

  dome.alert = {
    tone       : new Audio("/notice.wav"),
    pattern    : null,
    active     : false,
    titleProc  : null
  };

  const primeAlertTone = function() {
    if (!dome.alert.tone) return;

    dome.alert.tone.muted = true;
    const playAttempt = dome.alert.tone.play();

    if (playAttempt?.then) {
      playAttempt.then(() => {
        dome.alert.tone.pause();
        dome.alert.tone.currentTime = 0;
        dome.alert.tone.muted = false;
      }).catch(() => {
        dome.alert.tone.muted = false;
      });
    } else {
      dome.alert.tone.muted = false;
    }

    window.removeEventListener("pointerdown", primeAlertTone);
    window.removeEventListener("keydown", primeAlertTone);
    window.removeEventListener("touchstart", primeAlertTone);
  };

  dome.urlPatterns = {
    images: /png|jpg|gif|jpeg$/,
    videos: /mp4|gifv$/,
    youtube: /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/
  };

  dome.parseYouTubeID = function ( url ) {
    const match = url.match(dome.urlPatterns.youtube);
    return (match&&match[7].length==11)? match[7] : false;
  };

  const onUnloadHandler = function() {
    if (dome.socketState == SOCKET_STATE_ENUM.CONNECTED) socket.emit("input", "@quit\r\n");
  };

  const onBeforeUnloadHandler = function(event) {
    if (dome.socketState === SOCKET_STATE_ENUM.CONNECTED) {
      event.preventDefault();
      event.returnValue = "";
    }
  };

  const onFocusHandler = function() {
    dome.alert.active = false;
    if (dome.alert.titleProc != null) {
      window.clearInterval(dome.alert.titleProc);
      dome.alert.titleProc = null;
      document.title = dome.titleBarText;
    }
    if (dome.inputReader) {
      dome.inputReader.focus();
    }
  };

  dome.setWindowTitle = function(newTitle) {
    document.title = dome.titleBarText = newTitle;
  };

  const onBlurHandler = function() {
    if (dome.preferences.playDing) dome.alert.active = true;
  };

  const onResizeHandler = function() {
    dome.client.style.height = `${window.innerHeight}px`;
    dome.buffer.style.height = `${window.innerHeight - defaultHeightOffset}px`;
  };

  const inViewport = function(elem) {
    const bounds = elem.getBoundingClientRect();
    return !(bounds.right < 0 ||
             bounds.left > window.innerWidth ||
             bounds.bottom < 0 ||
             bounds.top > window.innerHeight);
  };

  const onScrollHandler = function() {
    const shownImages = dome.buffer.querySelectorAll(".shown-image");
    shownImages.forEach(image => {
      if (!inViewport(image)) {
        const imageId = image.id;
        const control = document.getElementById(`b${imageId}`);
        if (control) {
          control.classList.remove("icon-chevron-down");
          control.classList.add("icon-chevron-up");
        }
        const span = dome.buffer.querySelector(`span#s${imageId}`);
        if (span) span.innerHTML = "";
      }
    });
  };

  let titleAlerted = false;
  const alertTitle = function() {
    if (!titleAlerted) {
      document.title = "!! " + dome.titleBarText;
      titleAlerted=true;
    } else {
      document.title = dome.titleBarText;
      titleAlerted=false;
    }
  };

  dome.windowAlert = function() {
    if (dome.alert.titleProc != null) {
      return;
    }

    dome.alert.titleProc = window.setInterval(alertTitle, 500);
  };


  // this is needed because the 'resize' event fires inappropriately in iOS
  const iOS = ( navigator.userAgent.match(/(iPad|iPhone|iPod)/g) ? true : false );

  window.addEventListener("focus", onFocusHandler);
  window.addEventListener("blur", onBlurHandler);
  if (!iOS) {
    window.addEventListener("resize", onResizeHandler);
  }
  window.addEventListener("orientationchange", onResizeHandler);
  window.addEventListener("beforeunload", onBeforeUnloadHandler);
  window.addEventListener("unload", onUnloadHandler);
  dome.buffer.addEventListener("scroll", onScrollHandler);

  window.addEventListener("pointerdown", primeAlertTone, { once: true });
  window.addEventListener("keydown", primeAlertTone, { once: true });
  window.addEventListener("touchstart", primeAlertTone, { once: true });

  onResizeHandler();
};

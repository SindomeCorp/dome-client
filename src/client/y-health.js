import BarGraph from "./x-bar-graph.js";
import { formatDate } from "./a-date-format-date.js";
import { dome, logger, MOO_STATUS_ENUM, SOCKET_STATE_ENUM } from "./b-variables.js";

dome.setupHealthCheck = function() {
  if (!dome.healthDisplay || !dome.healthDetail) {
    return;
  }

  const showConnectionHelp = function(helpType) {
    // @TODO: make help to show ...
    logger.info("showing help for: " + helpType);
  };

  const troubleshootConnection = function(e) {
    const lastState = dome.gameHealth.state;
    if (lastState == MOO_STATUS_ENUM.UNCHECKED) {
      return "";
    } else if (lastState == MOO_STATUS_ENUM.OK || lastState == MOO_STATUS_ENUM.UNKNOWN) {
      if (e.code == "ETIMEOUT" && dome.gameHealth.cpu > 98) {
        showConnectionHelp(MOO_STATUS_ENUM.SEVERE_LAG);
        return "the moo is under heavy load and might not be able to respond in a timely manner";
      } else if (e.code == "ENOTFOUND" || e.code == "ETIMEOUT") {
        showConnectionHelp(MOO_STATUS_ENUM.NETWORK_ISSUE);
        return "unable to reach webclient server via socket, check your Internet connection";
      } else if (e.code == "ECONNREFUSED") {
        showConnectionHelp("CHECK_FIREWALL");
        return "socket connection refused, behind a strict company or school firewall?";
      } else {
        showConnectionHelp(MOO_STATUS_ENUM.NETWORK_ISSUE);
        return "unexpected error while opening socket to webclient server: " + e.code;
      }
    } else {
      // whatever other state is already in play
      showConnectionHelp(lastState);
    }

    return dome.gameHealth.message;
  };

  dome.onErrorHandler = function(e) {
    let msg = "";
    if (e) {
      if (e["msg"]) {
        msg = e.msg;
      } else if (e["code"]) {
        msg = e.code;
      }

      if (dome.socketState != SOCKET_STATE_ENUM.CONNECTED) {
        msg = troubleshootConnection(e);
      }
    }

    if (e) { logger.error(e); }
    if (msg && dome.statusDisplay) { dome.setFadeText(dome.statusDisplay, "ERROR: " + msg, true); }
  };

  dome.setFadeText = function(elem, msg, persist) {
    msg = msg.toUpperCase();
    elem.innerHTML = msg;
    if (elem.fadeAnimation) {
      elem.fadeAnimation.cancel();
    }
    elem.fadeAnimation = elem.animate([
      { opacity: 0 },
      { opacity: 1 }
    ], { duration: 500, fill: "forwards" });
    if (persist) {
      return;
    }
    elem.fadeAnimation.finished.then(() => {
      elem.fadeAnimation = elem.animate([
        { opacity: 1 },
        { opacity: 0 }
      ], { delay: 5000, duration: 1000, fill: "forwards" });
    }).catch(() => {});
  };

  let lastGlobeClass = "ok";
  let showingGameHealth = false;
  let clickedOpen = false;

  let detailAnimation;
  let hideTimeout;
  let overHealthArea = false;

  const isInHealthArea = target =>
    target && (dome.healthDetail.contains(target) || dome.healthDisplay.contains(target));

  const cancelHide = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimeout = setTimeout(() => {
      if (!overHealthArea) {
        dome.hideGameHealth();
      }
      hideTimeout = null;
    }, 500);
  };

  const handleHealthMouseOver = () => {
    overHealthArea = true;
    cancelHide();
    dome.showGameHealth();
  };

  const handleHealthMouseLeave = e => {
    overHealthArea = isInHealthArea(e.relatedTarget);
    if (!overHealthArea) {
      scheduleHide();
    }
  };

  dome.showGameHealth = function() {
    cancelHide();
    if (showingGameHealth) return;
    showingGameHealth = true;
    setTimeout(() => {
      if (!showingGameHealth) return;
      if (detailAnimation) {
        detailAnimation.cancel();
      }
      detailAnimation = dome.healthDetail.animate([
        { left: "-152px" },
        { left: "0px" }
      ], { duration: 250, fill: "forwards" });
    }, 25);
  };

  dome.hideGameHealth = function() {
    if (clickedOpen) return;
    if (!showingGameHealth) return;
    cancelHide();
    showingGameHealth = false;
    setTimeout(() => {
      if (showingGameHealth) return;
      if (detailAnimation) {
        detailAnimation.cancel();
      }
      detailAnimation = dome.healthDetail.animate([
        { left: "0px" },
        { left: "-152px" }
      ], { duration: 250, fill: "forwards" });
    }, 25);
  };

  dome.toggleGameHealth = function () {
    if ( showingGameHealth && clickedOpen ) {
      // close
      clickedOpen = false;
      dome.hideGameHealth();
    } else {
      clickedOpen = true;
      dome.showGameHealth();
    }
  };

  const createChartCanvas = function ( id ) {
    const canvas = document.createElement( "canvas" );
    canvas.setAttribute( "id", id );
    dome.healthDetail.append( canvas );
    return canvas.getContext( "2d" );
  };

  const cpuGraph = new BarGraph( createChartCanvas( "cpu-graph" ) );
  cpuGraph.maxValue = 100.0;
  cpuGraph.margin = 0;
  cpuGraph.baseColor = "#F89406";
  cpuGraph.fixedBarWidth = 2;
  cpuGraph.width = 150;
  cpuGraph.height = 50;

  const memGraph = new BarGraph( createChartCanvas( "mem-graph" ) );
  memGraph.maxValue = 3950000000;
  memGraph.margin = 0;
  memGraph.baseColor = "#08C";
  memGraph.fixedBarWidth = 2;
  memGraph.width = 150;
  memGraph.height = 50;

  const userGraph = new BarGraph( createChartCanvas( "user-graph" ) );
  userGraph.maxValue = 100;
  userGraph.margin = 0;
  userGraph.baseColor = "#8C0";
  userGraph.fixedBarWidth = 2;
  userGraph.width = 150;
  userGraph.height = 50;

  const detailedMOOStatus = document.createElement( "div" );
  detailedMOOStatus.setAttribute( "class", "last-details" );
  dome.healthDetail.append( detailedMOOStatus );

  const setGameHealthDisplay = function ( health ) {
    dome.gameHealth.push( health );
    if ( dome.gameHealth.length > 100 ) {
      dome.gameHealth.shift();
    }

    let globeClass = "ok";
    if ( health.state != MOO_STATUS_ENUM.OK && health.state != MOO_STATUS_ENUM.UNCHECKED ) {
      globeClass = "fatal";
    } else if ( health.cpu > 98 ) {
      globeClass = "warn";
    }

    const mem = (health.memory / 1024 / 1024).toFixed( 2 );

    let details = health.message + "<br>";

    if ( health.cpu > 0 ) {
      details += health.cpu + "% CPU consumption<br>";
    }
    if ( health.memory > 0 ) {
      details += mem + "MB RAM occupied<br>";
    }
    details += health.users + " users connected<br>";
    if ( health.checked ) {
      details += "Checked at " + formatDate(new Date(health.checked), "hh:mm:ss t");
    }

    dome.healthDisplay.innerHTML = `<i class="globe globe-${globeClass}"></i>`;
    detailedMOOStatus.innerHTML = details;
    if ( globeClass == "fatal" || globeClass != lastGlobeClass && (dome.setFadeText && dome.statusDisplay) ) {
      dome.setFadeText( dome.statusDisplay, health.message, globeClass != "ok" ? true : false );
    }
    if ( dome.gameHealth ) {
      const cpuValues = dome.gameHealth.map(h => h.cpu);
      const memValues = dome.gameHealth.map(h => h.memory);
      const userValues = dome.gameHealth.map(h => h.users);

      while ( cpuValues.length < 100 ) {
        cpuValues.push( 0 );
      }
      while ( memValues.length < 100 ) {
        memValues.push( 0 );
      }
      while ( userValues.length < 100 ) {
        userValues.push( 0 );
      }
      cpuGraph.update( cpuValues );
      memGraph.update( memValues );
      userGraph.update( userValues );
    }
    lastGlobeClass = globeClass;
  };
  dome.healthDisplay.addEventListener("mouseover", handleHealthMouseOver);
  dome.healthDisplay.addEventListener("mouseleave", handleHealthMouseLeave);
  dome.healthDetail.addEventListener("mouseover", handleHealthMouseOver);
  dome.healthDetail.addEventListener("mouseleave", handleHealthMouseLeave);
  dome.healthDetail.addEventListener("click", dome.toggleGameHealth);


  const updateMOOStatus = function () {

    if (dome.preferences.performanceBuffer != 0) {
      dome.perfBufferFlag.setAttribute(
        "title",
        "Scrollback limited to " + dome.preferences.performanceBuffer + " lines"
      );
      dome.perfBufferFlag.classList.remove("hide");
    }

    
    fetch("/moo/status/")
      .then((res) => res.json())
      .then((health) => {
        setGameHealthDisplay(health);
      })
      .catch((err) => {
        const health = {
          cpu: 0,
          memory: 0,
          checked: new Date().getTime(),
          state: MOO_STATUS_ENUM.WEBCLIENT_DOWN,
          message: "",
        };
        if (err && err.code) {
          if (err.code == "ENOTFOUND") {
            health.state = MOO_STATUS_ENUM.NETWORK_ISSUE;
            health.message = "unable to reach webclient server, check your Internet connection";
          } else if (err.code == "ETIMEDOUT") {
            // local network problem or server offline
            health.message = "unable to reach webclient server after a reasonable time, server may be offline";
          } else if (err.code == "ECONNREFUSED") {
            health.state = MOO_STATUS_ENUM.NETWORK_ISSUE;
            health.message = "server connection refused, behind a strict company or school firewall?";
          } else {
            health.message = "error while connecting to webclient server: " + err.code;
          }
        }
        logger.error(err);
        setGameHealthDisplay(health);
      });
  };
  setInterval( updateMOOStatus, 30000 );
  updateMOOStatus();

};

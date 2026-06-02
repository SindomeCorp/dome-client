import BarGraph from "./x-bar-graph.js";
import { dome, logger, SOCKET_STATE_ENUM } from "./b-variables.js";
import {
  buildHealthDetails,
  classifyHealthStatus,
  createPollingErrorHealth,
  diagnoseConnectionError,
  shapeHealthGraphSeries
} from "./health-status.js";

dome.setupHealthCheck = function() {
  if (!dome.healthDisplay || !dome.healthDetail) {
    return;
  }

  const showConnectionHelp = function(helpType) {
    // @TODO: make help to show ...
    logger.info("showing help for: " + helpType);
  };

  const troubleshootConnection = function(e) {
    const diagnosis = diagnoseConnectionError(e, dome.gameHealth);
    if (diagnosis.helpType) {
      showConnectionHelp(diagnosis.helpType);
    }

    return diagnosis.message;
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

    const globeClass = classifyHealthStatus(health);
    const details = buildHealthDetails(health);

    dome.healthDisplay.innerHTML = `<i class="globe globe-${globeClass}"></i>`;
    detailedMOOStatus.innerHTML = details;
    if ( globeClass == "fatal" || globeClass != lastGlobeClass && (dome.setFadeText && dome.statusDisplay) ) {
      dome.setFadeText( dome.statusDisplay, health.message, globeClass != "ok" ? true : false );
    }
    if ( dome.gameHealth ) {
      const { cpuValues, memValues, userValues } = shapeHealthGraphSeries(dome.gameHealth);
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
        const health = createPollingErrorHealth(err);
        logger.error(err);
        setGameHealthDisplay(health);
      });
  };
  setInterval( updateMOOStatus, 30000 );
  updateMOOStatus();

};

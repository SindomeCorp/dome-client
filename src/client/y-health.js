import BarGraph from "./x-bar-graph.js";
import { logger, SOCKET_STATE_ENUM } from "./b-variables.js";
import {
  buildHealthDetails,
  classifyHealthStatus,
  createPollingErrorHealth,
  diagnoseConnectionError,
  shapeHealthGraphSeries
} from "./health-status.js";

export function setupHealthCheck({
  client,
  doc = globalThis.document,
  fetchFn = (...args) => globalThis.fetch(...args),
  log = logger,
  setIntervalFn = (...args) => globalThis.setInterval(...args),
  setTimeoutFn = (...args) => globalThis.setTimeout(...args),
  clearTimeoutFn = (...args) => globalThis.clearTimeout(...args)
} = {}) {
  if (!client.healthDisplay || !client.healthDetail) {
    return;
  }

  const showConnectionHelp = function(helpType) {
    // @TODO: make help to show ...
    log.info("showing help for: " + helpType);
  };

  const troubleshootConnection = function(e) {
    const diagnosis = diagnoseConnectionError(e, client.gameHealth);
    if (diagnosis.helpType) {
      showConnectionHelp(diagnosis.helpType);
    }

    return diagnosis.message;
  };

  client.onErrorHandler = function(e) {
    let msg = "";
    if (e) {
      if (e["msg"]) {
        msg = e.msg;
      } else if (e["code"]) {
        msg = e.code;
      }

      if (client.socketState != SOCKET_STATE_ENUM.CONNECTED) {
        msg = troubleshootConnection(e);
      }
    }

    if (e) { log.error(e); }
    if (msg && client.statusDisplay) { client.setFadeText(client.statusDisplay, "ERROR: " + msg, true); }
  };

  client.setFadeText = function(elem, msg, persist) {
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
    target && (client.healthDetail.contains(target) || client.healthDisplay.contains(target));

  const cancelHide = () => {
    if (hideTimeout) {
      clearTimeoutFn(hideTimeout);
      hideTimeout = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimeout = setTimeoutFn(() => {
      if (!overHealthArea) {
        client.hideGameHealth();
      }
      hideTimeout = null;
    }, 500);
  };

  const handleHealthMouseOver = () => {
    overHealthArea = true;
    cancelHide();
    client.showGameHealth();
  };

  const handleHealthMouseLeave = e => {
    overHealthArea = isInHealthArea(e.relatedTarget);
    if (!overHealthArea) {
      scheduleHide();
    }
  };

  client.showGameHealth = function() {
    cancelHide();
    if (showingGameHealth) return;
    showingGameHealth = true;
    setTimeoutFn(() => {
      if (!showingGameHealth) return;
      if (detailAnimation) {
        detailAnimation.cancel();
      }
      detailAnimation = client.healthDetail.animate([
        { left: "-152px" },
        { left: "0px" }
      ], { duration: 250, fill: "forwards" });
    }, 25);
  };

  client.hideGameHealth = function() {
    if (clickedOpen) return;
    if (!showingGameHealth) return;
    cancelHide();
    showingGameHealth = false;
    setTimeoutFn(() => {
      if (showingGameHealth) return;
      if (detailAnimation) {
        detailAnimation.cancel();
      }
      detailAnimation = client.healthDetail.animate([
        { left: "0px" },
        { left: "-152px" }
      ], { duration: 250, fill: "forwards" });
    }, 25);
  };

  client.toggleGameHealth = function () {
    if ( showingGameHealth && clickedOpen ) {
      // close
      clickedOpen = false;
      client.hideGameHealth();
    } else {
      clickedOpen = true;
      client.showGameHealth();
    }
  };

  const createChartCanvas = function ( id ) {
    const canvas = doc.createElement( "canvas" );
    canvas.setAttribute( "id", id );
    client.healthDetail.append( canvas );
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

  const detailedMOOStatus = doc.createElement( "div" );
  detailedMOOStatus.setAttribute( "class", "last-details" );
  client.healthDetail.append( detailedMOOStatus );

  const setGameHealthDisplay = function ( health ) {
    client.gameHealth.push( health );
    if ( client.gameHealth.length > 100 ) {
      client.gameHealth.shift();
    }

    const globeClass = classifyHealthStatus(health);
    const details = buildHealthDetails(health);

    client.healthDisplay.innerHTML = `<i class="globe globe-${globeClass}"></i>`;
    detailedMOOStatus.innerHTML = details;
    if ( globeClass == "fatal" || globeClass != lastGlobeClass && (client.setFadeText && client.statusDisplay) ) {
      client.setFadeText( client.statusDisplay, health.message, globeClass != "ok" ? true : false );
    }
    if ( client.gameHealth ) {
      const { cpuValues, memValues, userValues } = shapeHealthGraphSeries(client.gameHealth);
      cpuGraph.update( cpuValues );
      memGraph.update( memValues );
      userGraph.update( userValues );
    }
    lastGlobeClass = globeClass;
  };
  client.healthDisplay.addEventListener("mouseover", handleHealthMouseOver);
  client.healthDisplay.addEventListener("mouseleave", handleHealthMouseLeave);
  client.healthDetail.addEventListener("mouseover", handleHealthMouseOver);
  client.healthDetail.addEventListener("mouseleave", handleHealthMouseLeave);
  client.healthDetail.addEventListener("click", client.toggleGameHealth);


  const updateMOOStatus = function () {

    if (client.preferences.performanceBuffer != 0) {
      client.perfBufferFlag.setAttribute(
        "title",
        "Scrollback limited to " + client.preferences.performanceBuffer + " lines"
      );
      client.perfBufferFlag.classList.remove("hide");
    }

    
    fetchFn("/moo/status/")
      .then((res) => res.json())
      .then((health) => {
        setGameHealthDisplay(health);
      })
      .catch((err) => {
        const health = createPollingErrorHealth(err);
        log.error(err);
        setGameHealthDisplay(health);
      });
  };
  setIntervalFn( updateMOOStatus, 30000 );
  updateMOOStatus();

}

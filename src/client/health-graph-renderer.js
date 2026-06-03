import BarGraph from "./x-bar-graph.js";
import {
  buildHealthDetails,
  classifyHealthStatus,
  shapeHealthGraphSeries
} from "./health-status.js";

const configureGraph = (graph, options) => {
  Object.assign(graph, {
    margin: 0,
    fixedBarWidth: 2,
    width: 150,
    height: 50,
    ...options
  });
  return graph;
};

export function createHealthGraphRenderer({
  client,
  doc = globalThis.document,
  onStatusChange = () => {}
} = {}) {
  let lastGlobeClass = "ok";

  const createChartCanvas = (id) => {
    const canvas = doc.createElement("canvas");
    canvas.setAttribute("id", id);
    client.healthDetail.append(canvas);
    return canvas.getContext("2d");
  };

  const cpuGraph = configureGraph(new BarGraph(createChartCanvas("cpu-graph")), {
    maxValue: 100.0,
    baseColor: "#F89406"
  });
  const memGraph = configureGraph(new BarGraph(createChartCanvas("mem-graph")), {
    maxValue: 3950000000,
    baseColor: "#08C"
  });
  const userGraph = configureGraph(new BarGraph(createChartCanvas("user-graph")), {
    maxValue: 100,
    baseColor: "#8C0"
  });

  const detailedMOOStatus = doc.createElement("div");
  detailedMOOStatus.setAttribute("class", "last-details");
  client.healthDetail.append(detailedMOOStatus);

  const renderHealth = (health) => {
    client.gameHealth.push(health);
    Object.assign(client.gameHealth, health);
    if (client.gameHealth.length > 100) {
      client.gameHealth.shift();
    }

    const globeClass = classifyHealthStatus(health);
    client.healthDisplay.innerHTML = `<i class="globe globe-${globeClass}"></i>`;
    detailedMOOStatus.innerHTML = buildHealthDetails(health);

    if (globeClass == "fatal" || globeClass != lastGlobeClass) {
      onStatusChange(health.message, { persist: globeClass != "ok" });
    }

    const { cpuValues, memValues, userValues } = shapeHealthGraphSeries(client.gameHealth);
    cpuGraph.update(cpuValues);
    memGraph.update(memValues);
    userGraph.update(userValues);
    lastGlobeClass = globeClass;
  };

  return {
    graphs: { cpuGraph, memGraph, userGraph },
    renderHealth
  };
}

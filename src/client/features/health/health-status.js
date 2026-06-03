import { formatDate } from "../../core/date-format.js";
import { MOO_STATUS_ENUM } from "../../core/constants.js";

export function classifyHealthStatus(health) {
  if (health.state != MOO_STATUS_ENUM.OK && health.state != MOO_STATUS_ENUM.UNCHECKED) {
    return "fatal";
  }

  if (health.cpu > 98) {
    return "warn";
  }

  return "ok";
}

export function diagnoseConnectionError(error, lastHealth) {
  const lastState = lastHealth.state;
  if (lastState == MOO_STATUS_ENUM.UNCHECKED) {
    return { message: "", helpType: "" };
  }

  if (lastState == MOO_STATUS_ENUM.OK || lastState == MOO_STATUS_ENUM.UNKNOWN) {
    if (error.code == "ETIMEOUT" && lastHealth.cpu > 98) {
      return {
        helpType: MOO_STATUS_ENUM.SEVERE_LAG,
        message: "the moo is under heavy load and might not be able to respond in a timely manner"
      };
    }

    if (error.code == "ENOTFOUND" || error.code == "ETIMEOUT") {
      return {
        helpType: MOO_STATUS_ENUM.NETWORK_ISSUE,
        message: "unable to reach webclient server via socket, check your Internet connection"
      };
    }

    if (error.code == "ECONNREFUSED") {
      return {
        helpType: "CHECK_FIREWALL",
        message: "socket connection refused, behind a strict company or school firewall?"
      };
    }

    return {
      helpType: MOO_STATUS_ENUM.NETWORK_ISSUE,
      message: "unexpected error while opening socket to webclient server: " + error.code
    };
  }

  return { message: lastHealth.message, helpType: lastState };
}

export function createPollingErrorHealth(error, now = Date.now()) {
  const health = {
    cpu: 0,
    memory: 0,
    checked: now,
    state: MOO_STATUS_ENUM.WEBCLIENT_DOWN,
    message: ""
  };

  if (!error || !error.code) {
    return health;
  }

  if (error.code == "ENOTFOUND") {
    health.state = MOO_STATUS_ENUM.NETWORK_ISSUE;
    health.message = "unable to reach webclient server, check your Internet connection";
  } else if (error.code == "ETIMEDOUT") {
    health.message = "unable to reach webclient server after a reasonable time, server may be offline";
  } else if (error.code == "ECONNREFUSED") {
    health.state = MOO_STATUS_ENUM.NETWORK_ISSUE;
    health.message = "server connection refused, behind a strict company or school firewall?";
  } else {
    health.message = "error while connecting to webclient server: " + error.code;
  }

  return health;
}

export function buildHealthDetails(health) {
  const mem = (health.memory / 1024 / 1024).toFixed(2);
  let details = health.message + "<br>";

  if (health.cpu > 0) {
    details += health.cpu + "% CPU consumption<br>";
  }
  if (health.memory > 0) {
    details += mem + "MB RAM occupied<br>";
  }
  details += health.users + " users connected<br>";
  if (health.checked) {
    details += "Checked at " + formatDate(new Date(health.checked), "hh:mm:ss t");
  }

  return details;
}

export function shapeHealthGraphSeries(healthHistory, minLength = 100) {
  const cpuValues = healthHistory.map(h => h.cpu);
  const memValues = healthHistory.map(h => h.memory);
  const userValues = healthHistory.map(h => h.users);

  while (cpuValues.length < minLength) {
    cpuValues.push(0);
  }
  while (memValues.length < minLength) {
    memValues.push(0);
  }
  while (userValues.length < minLength) {
    userValues.push(0);
  }

  return { cpuValues, memValues, userValues };
}

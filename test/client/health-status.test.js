import { test } from "node:test";
import assert from "node:assert/strict";
import { MOO_STATUS_ENUM } from "../../src/client/core/constants.js";
import {
  buildHealthDetails,
  classifyHealthStatus,
  createPollingErrorHealth,
  diagnoseConnectionError,
  shapeHealthGraphSeries
} from "../../src/client/features/health/health-status.js";

test("classifyHealthStatus maps healthy, warning, and fatal states", () => {
  assert.equal(classifyHealthStatus({
    state: MOO_STATUS_ENUM.OK,
    cpu: 0
  }), "ok");
  assert.equal(classifyHealthStatus({
    state: MOO_STATUS_ENUM.UNCHECKED,
    cpu: 99
  }), "warn");
  assert.equal(classifyHealthStatus({
    state: MOO_STATUS_ENUM.NETWORK_ISSUE,
    cpu: 0
  }), "fatal");
});

test("diagnoseConnectionError returns socket help types and messages", () => {
  assert.deepEqual(diagnoseConnectionError(
    { code: "ETIMEOUT" },
    { state: MOO_STATUS_ENUM.OK, cpu: 99, message: "busy" }
  ), {
    helpType: MOO_STATUS_ENUM.SEVERE_LAG,
    message: "the moo is under heavy load and might not be able to respond in a timely manner"
  });
  assert.deepEqual(diagnoseConnectionError(
    { code: "ENOTFOUND" },
    { state: MOO_STATUS_ENUM.UNKNOWN, cpu: 0, message: "unknown" }
  ), {
    helpType: MOO_STATUS_ENUM.NETWORK_ISSUE,
    message: "unable to reach webclient server via socket, check your Internet connection"
  });
  assert.deepEqual(diagnoseConnectionError(
    { code: "ECONNREFUSED" },
    { state: MOO_STATUS_ENUM.OK, cpu: 0, message: "ok" }
  ), {
    helpType: "CHECK_FIREWALL",
    message: "socket connection refused, behind a strict company or school firewall?"
  });
  assert.deepEqual(diagnoseConnectionError(
    { code: "EOTHER" },
    { state: MOO_STATUS_ENUM.OK, cpu: 0, message: "ok" }
  ), {
    helpType: MOO_STATUS_ENUM.NETWORK_ISSUE,
    message: "unexpected error while opening socket to webclient server: EOTHER"
  });
  assert.deepEqual(diagnoseConnectionError(
    { code: "EOTHER" },
    { state: MOO_STATUS_ENUM.MOO_OFFLINE, cpu: 0, message: "moo offline" }
  ), {
    helpType: MOO_STATUS_ENUM.MOO_OFFLINE,
    message: "moo offline"
  });
  assert.deepEqual(diagnoseConnectionError(
    { code: "ENOTFOUND" },
    { state: MOO_STATUS_ENUM.UNCHECKED, cpu: 0, message: "" }
  ), {
    helpType: "",
    message: ""
  });
});

test("createPollingErrorHealth maps ajax failure codes to health objects", () => {
  assert.deepEqual(createPollingErrorHealth({ code: "ENOTFOUND" }, 123), {
    cpu: 0,
    memory: 0,
    checked: 123,
    state: MOO_STATUS_ENUM.NETWORK_ISSUE,
    message: "unable to reach webclient server, check your Internet connection"
  });
  assert.deepEqual(createPollingErrorHealth({ code: "ETIMEDOUT" }, 123), {
    cpu: 0,
    memory: 0,
    checked: 123,
    state: MOO_STATUS_ENUM.WEBCLIENT_DOWN,
    message: "unable to reach webclient server after a reasonable time, server may be offline"
  });
  assert.deepEqual(createPollingErrorHealth({ code: "ECONNREFUSED" }, 123), {
    cpu: 0,
    memory: 0,
    checked: 123,
    state: MOO_STATUS_ENUM.NETWORK_ISSUE,
    message: "server connection refused, behind a strict company or school firewall?"
  });
  assert.deepEqual(createPollingErrorHealth({ code: "EOTHER" }, 123), {
    cpu: 0,
    memory: 0,
    checked: 123,
    state: MOO_STATUS_ENUM.WEBCLIENT_DOWN,
    message: "error while connecting to webclient server: EOTHER"
  });
});

test("buildHealthDetails formats metric details", () => {
  const details = buildHealthDetails({
    cpu: 7,
    memory: 1048576,
    users: 3,
    checked: 0,
    message: "all good"
  });

  assert.equal(details, "all good<br>7% CPU consumption<br>1.00MB RAM occupied<br>3 users connected<br>");
});

test("shapeHealthGraphSeries pads cpu, memory, and user series", () => {
  const result = shapeHealthGraphSeries([
    { cpu: 1, memory: 2, users: 3 },
    { cpu: 4, memory: 5, users: 6 }
  ], 4);

  assert.deepEqual(result, {
    cpuValues: [1, 4, 0, 0],
    memValues: [2, 5, 0, 0],
    userValues: [3, 6, 0, 0]
  });
});

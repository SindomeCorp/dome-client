import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommandDispatcher } from "../../src/client/input-command-dispatch.js";

const createHarness = ({ localEcho = true, ackStatus = "command sent" } = {}) => {
  const fadeCalls = [];
  const dome = {
    buffer: {
      appended: [],
      insertAdjacentHTML(pos, value) {
        this.appended.push({ pos, value });
      }
    },
    preferences: { localEcho },
    statusDisplay: {},
    setFadeText(...args) {
      fadeCalls.push(args);
    }
  };
  const socket = {
    events: [],
    emit(event, command, callback) {
      this.events.push({ event, command });
      callback({ status: ackStatus });
    }
  };

  return {
    dome,
    fadeCalls,
    socket,
    dispatcher: createCommandDispatcher({ dome, socket })
  };
};

test("normal commands echo and emit socket input", () => {
  const { dispatcher, dome, socket } = createHarness();

  dispatcher.sendCommand("say hi");

  assert.deepEqual(socket.events, [{ event: "input", command: "say hi" }]);
  assert.deepEqual(dome.buffer.appended, [{
    pos: "beforeend",
    value: "<span class=\"input-echo\">&gt;say hi</span>\n"
  }]);
});

test("command sent ack updates status display to SENT", () => {
  const { dispatcher, dome, fadeCalls } = createHarness({ ackStatus: "command sent ok" });

  dispatcher.sendCommand("look");

  assert.deepEqual(fadeCalls, [[dome.statusDisplay, "SENT", false]]);
});

test("non-command-sent ack status is passed through", () => {
  const { dispatcher, dome, fadeCalls } = createHarness({ ackStatus: "queued" });

  dispatcher.sendCommand("look");

  assert.deepEqual(fadeCalls, [[dome.statusDisplay, "queued", false]]);
});

test("client option commands echo and parse without socket emit", () => {
  const { dispatcher, dome, socket } = createHarness();
  const parsed = [];
  dome.parseClientOptionCommand = (command) => parsed.push(command);

  dispatcher.sendCommand("@client-option inputFontSize 14");

  assert.deepEqual(parsed, ["@client-option inputFontSize 14"]);
  assert.deepEqual(socket.events, []);
  assert.equal(dome.buffer.appended[0].value, "<span class=\"input-echo\">&gt;@client-option inputFontSize 14</span>\n");
});

test("test command echoes and opens the IDE without socket emit", () => {
  const { dispatcher, dome, socket } = createHarness();
  const opened = [];
  dome.openIDE = (options) => opened.push(options);

  dispatcher.sendCommand("@test");

  assert.deepEqual(opened, [{
    editorName: "Test Tab",
    uploadCommand: "@save-test",
    buffer: "This is some test data"
  }]);
  assert.deepEqual(socket.events, []);
  assert.equal(dome.buffer.appended[0].value, "<span class=\"input-echo\">&gt;@test</span>\n");
});

test("local echo can be disabled", () => {
  const { dispatcher, dome, socket } = createHarness({ localEcho: false });

  dispatcher.sendCommand("say hi");

  assert.deepEqual(socket.events, [{ event: "input", command: "say hi" }]);
  assert.deepEqual(dome.buffer.appended, []);
});

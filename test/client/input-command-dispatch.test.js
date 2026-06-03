import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommandDispatcher } from "../../src/client/input-command-dispatch.js";

const createHarness = ({ localEcho = true, ackStatus = "command sent" } = {}) => {
  const fadeCalls = [];
  const client = {
    buffer: {
      appended: [],
      insertAdjacentHTML(pos, value) {
        this.appended.push({ pos, value });
      }
    },
    health: {
      showStatus(...args) {
        fadeCalls.push(args);
      }
    },
    preferences: { localEcho },
    statusDisplay: {}
  };
  const socket = {
    events: [],
    emit(event, command, callback) {
      this.events.push({ event, command });
      callback({ status: ackStatus });
    }
  };

  return {
    client,
    fadeCalls,
    socket,
    dispatcher: createCommandDispatcher({ client, socket })
  };
};

test("normal commands echo and emit socket input", () => {
  const { dispatcher, client, socket } = createHarness();

  dispatcher.sendCommand("say hi");

  assert.deepEqual(socket.events, [{ event: "input", command: "say hi" }]);
  assert.deepEqual(client.buffer.appended, [{
    pos: "beforeend",
    value: "<span class=\"input-echo\">&gt;say hi</span>\n"
  }]);
});

test("command sent ack updates status display to SENT", () => {
  const { dispatcher, fadeCalls } = createHarness({ ackStatus: "command sent ok" });

  dispatcher.sendCommand("look");

  assert.deepEqual(fadeCalls, [["SENT"]]);
});

test("non-command-sent ack status is passed through", () => {
  const { dispatcher, fadeCalls } = createHarness({ ackStatus: "queued" });

  dispatcher.sendCommand("look");

  assert.deepEqual(fadeCalls, [["queued"]]);
});

test("client option commands echo and parse without socket emit", () => {
  const { dispatcher, client, socket } = createHarness();
  const parsed = [];
  client.parseClientOptionCommand = (command) => parsed.push(command);

  dispatcher.sendCommand("@client-option inputFontSize 14");

  assert.deepEqual(parsed, ["@client-option inputFontSize 14"]);
  assert.deepEqual(socket.events, []);
  assert.equal(client.buffer.appended[0].value, "<span class=\"input-echo\">&gt;@client-option inputFontSize 14</span>\n");
});

test("test command echoes and opens the IDE without socket emit", () => {
  const { dispatcher, client, socket } = createHarness();
  const opened = [];
  client.openIDE = (options) => opened.push(options);

  dispatcher.sendCommand("@test");

  assert.deepEqual(opened, [{
    editorName: "Test Tab",
    uploadCommand: "@save-test",
    buffer: "This is some test data"
  }]);
  assert.deepEqual(socket.events, []);
  assert.equal(client.buffer.appended[0].value, "<span class=\"input-echo\">&gt;@test</span>\n");
});

test("local echo can be disabled", () => {
  const { dispatcher, client, socket } = createHarness({ localEcho: false });

  dispatcher.sendCommand("say hi");

  assert.deepEqual(socket.events, [{ event: "input", command: "say hi" }]);
  assert.deepEqual(client.buffer.appended, []);
});

test("dispatcher resolves socket at send time", () => {
  const { client, socket } = createHarness();
  client.socket = null;
  const dispatcher = createCommandDispatcher({ client, socket: null });

  client.socket = socket;
  dispatcher.sendCommand("say hi");

  assert.deepEqual(socket.events, [{ event: "input", command: "say hi" }]);
});

test("missing socket reports status instead of throwing", () => {
  const { client, fadeCalls } = createHarness();
  const dispatcher = createCommandDispatcher({ client, socket: null });

  assert.doesNotThrow(() => dispatcher.sendCommand("say hi"));
  assert.deepEqual(fadeCalls, [["ERROR: socket is not connected", { persist: true }]]);
});

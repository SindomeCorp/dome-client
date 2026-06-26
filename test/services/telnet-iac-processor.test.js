import test from "node:test";
import assert from "node:assert/strict";
import { createTelnetIacProcessor } from "../../src/services/telnet-iac-processor.js";

function makeProcessor() {
  const events = [];
  const warnings = [];
  const processor = createTelnetIacProcessor({
    onEvent: event => events.push(event),
    logger: {
      warn: (...args) => warnings.push(args)
    }
  });
  return { processor, events, warnings };
}

test("Telnet IAC processor strips DO TERMINAL-TYPE from surrounding text", () => {
  const { processor, events } = makeProcessor();
  const output = processor.filter(Buffer.concat([
    Buffer.from("before"),
    Buffer.from([255, 253, 24]),
    Buffer.from("after")
  ]));

  assert.equal(output.toString(), "beforeafter");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    type: "command",
    command: 253,
    commandName: "DO",
    option: 24
  });
});

test("Telnet IAC processor strips WILL MSSP from surrounding text", () => {
  const { processor, events } = makeProcessor();
  const output = processor.filter(Buffer.concat([
    Buffer.from("before"),
    Buffer.from([255, 251, 70]),
    Buffer.from("after")
  ]));

  assert.equal(output.toString(), "beforeafter");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    type: "command",
    command: 251,
    commandName: "WILL",
    option: 70
  });
});

test("Telnet IAC processor handles command split across chunks", () => {
  const { processor, events } = makeProcessor();

  const first = processor.filter(Buffer.from([97, 255]));
  const second = processor.filter(Buffer.from([253, 24, 98]));

  assert.equal(first.toString(), "a");
  assert.equal(second.toString(), "b");
  assert.deepEqual(events.map(event => event.commandName), ["DO"]);
  assert.equal(events[0].option, 24);
});

test("Telnet IAC processor handles subnegotiation split across chunks", () => {
  const { processor, events } = makeProcessor();

  const first = processor.filter(Buffer.concat([
    Buffer.from("a"),
    Buffer.from([255, 250, 24]),
    Buffer.from("abc")
  ]));
  const second = processor.filter(Buffer.concat([
    Buffer.from("def"),
    Buffer.from([255, 240]),
    Buffer.from("b")
  ]));

  assert.equal(first.toString(), "a");
  assert.equal(second.toString(), "b");
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "subnegotiation");
  assert.equal(events[0].option, 24);
  assert.equal(events[0].data.toString(), "abcdef");
});

test("Telnet IAC processor leaves ordinary text unchanged", () => {
  const { processor, events } = makeProcessor();

  const output = processor.filter(Buffer.from("ordinary text"));

  assert.equal(output.toString(), "ordinary text");
  assert.deepEqual(events, []);
});

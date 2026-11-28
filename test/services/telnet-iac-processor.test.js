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

test("Telnet subnegotiation handles byte splits and escaped IAC", () => {
  const { processor, events } = makeProcessor();
  const wire = [97, 255, 250, 24, 1, 255, 255, 2, 255, 240, 98, 255, 255];
  const output = Buffer.concat(wire.map(byte => processor.filter(Uint8Array.of(byte))));
  assert.deepEqual(output, Buffer.from([97, 98, 255]));
  assert.deepEqual(events, [{ type: "subnegotiation", command: 250, commandName: "SB", option: 24, data: Buffer.from([1, 255, 2]) }]);
});

test("Telnet discards capped subnegotiations through the framed end and resumes output", () => {
  for (const [limit, wire] of [
    [5, [255, 250, 24, 1, 2, 3, 240, 255, 255, 240, 255, 240]],
    [5, [255, 250, 24, 1, 255, 240]],
    [5, [255, 250, 24, 1, 2, 255, 240]]
  ]) {
    const events = [];
    const warnings = [];
    const processor = createTelnetIacProcessor({
      maxSequenceBytes: limit,
      onEvent: event => events.push(event),
      logger: { warn: message => warnings.push(message) }
    });
    const chunks = [...wire, 97, 255, 252, 24, 98].map(byte => processor.filter(Buffer.from([byte])));
    assert.equal(Buffer.concat(chunks).toString(), "ab");
    assert.deepEqual(events, [{ type: "command", command: 252, commandName: "WONT", option: 24 }]);
    assert.deepEqual(warnings, ["dropping overlong Telnet IAC sequence"]);
  }
});

test("Telnet reports commands without options and continues after a callback fails", () => {
  const events = [];
  const debug = [];
  const warnings = [];
  const failure = new Error("fixture event handler failure");
  const processor = createTelnetIacProcessor({
    onEvent(event) {
      events.push(event);
      if (event.command === 241) throw failure;
    },
    logger: { warn: (...args) => warnings.push(args), debug: message => debug.push(message) }
  });

  assert.equal(processor.filter(Buffer.from([255, 250, 24, 255, 242, 255, 241, 255, 239, 97])).toString(), "a");
  assert.deepEqual(events, [
    { type: "command", command: 241, commandName: "NOP", option: undefined },
    { type: "command", command: 239, commandName: "UNKNOWN_239", option: undefined }
  ]);
  assert.deepEqual(warnings, [
    ["dropping malformed Telnet IAC subnegotiation"],
    ["telnet iac event handler failed", failure]
  ]);
  assert.deepEqual(debug, ["telnet iac command: UNKNOWN_239"]);
});

test("Telnet names standalone commands and negotiates DONT separately from DO", () => {
  const { processor, events } = makeProcessor();
  const names = ["SE", "NOP", "DM", "BRK", "IP", "AO", "AYT", "EC", "EL", "GA"];
  const wire = names.flatMap((_name, index) => [255, 240 + index]);
  assert.equal(processor.filter(Buffer.from([...wire, 255, 254, 42, 97])).toString(), "a");
  assert.deepEqual(events.map(event => event.commandName), [...names, "DONT"]);
  assert.equal(events.at(-1).option, 42);
});

test("Telnet accepts a subnegotiation that exactly fits the byte limit", () => {
  const events = [];
  const processor = createTelnetIacProcessor({ maxSequenceBytes: 6, onEvent: event => events.push(event) });
  assert.deepEqual(processor.filter(Buffer.from([255, 250, 24, 1, 255, 240])), Buffer.alloc(0));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, Buffer.from([1]));
  assert.equal(processor.filter(Buffer.from("done")).toString(), "done");
});

test("separate Telnet subnegotiations keep independent payloads and diagnostics", () => {
  const events = [];
  const debug = [];
  const processor = createTelnetIacProcessor({ onEvent: event => events.push(event), logger: { debug: line => debug.push(line) } });
  processor.filter(Buffer.from([255, 250, 24, 1, 255, 240, 255, 250, 42, 2, 255, 240]));
  assert.deepEqual(events.map(event => event.data), [Buffer.from([1]), Buffer.from([2])]);
  assert.deepEqual(debug, ["telnet iac subnegotiation: SB 24", "telnet iac subnegotiation: SB 42"]);
});

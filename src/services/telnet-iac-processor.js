const IAC = 255;
const SE = 240;
const SB = 250;
const WILL = 251;
const WONT = 252;
const DO = 253;
const DONT = 254;
const DEFAULT_MAX_SEQUENCE_BYTES = 4096;

const negotiationCommands = new Set([WILL, WONT, DO, DONT]);

const commandNames = new Map([
  [SE, "SE"],
  [241, "NOP"],
  [242, "DM"],
  [243, "BRK"],
  [244, "IP"],
  [245, "AO"],
  [246, "AYT"],
  [247, "EC"],
  [248, "EL"],
  [249, "GA"],
  [SB, "SB"],
  [WILL, "WILL"],
  [WONT, "WONT"],
  [DO, "DO"],
  [DONT, "DONT"]
]);

export function createTelnetIacProcessor({
  onEvent = () => {},
  logger,
  maxSequenceBytes = DEFAULT_MAX_SEQUENCE_BYTES
} = {}) {
  let state = "data";
  let command = null;
  let option = null;
  let sequenceBytes = 0;
  let payload = [];

  function resetSequence() {
    state = "data";
    sequenceBytes = 0;
    payload = [];
  }

  function emitEvent(event) {
    try {
      onEvent(event);
      logger?.debug?.(`telnet iac ${event.type}: ${event.commandName || "SB"}${event.option === undefined ? "" : ` ${event.option}`}`);
    } catch (err) {
      logger?.warn?.("telnet iac event handler failed", err);
    }
  }

  function emitCommand(commandByte, optionByte) {
    emitEvent({
      type: "command",
      command: commandByte,
      commandName: commandNames.get(commandByte) || `UNKNOWN_${commandByte}`,
      option: optionByte
    });
  }

  function emitSubnegotiation() {
    emitEvent({
      type: "subnegotiation",
      command: SB,
      commandName: "SB",
      option,
      data: Buffer.from(payload)
    });
  }

  function exceedsSubnegotiationLimit(byte) {
    sequenceBytes++;
    if (sequenceBytes <= maxSequenceBytes) return false;

    logger?.warn?.("dropping overlong Telnet IAC sequence");
    const previousState = state;
    resetSequence();
    if (previousState === "subnegotiationIac" && byte === SE) return true;
    state = previousState === "subnegotiationData" && byte === IAC
      ? "discardSubnegotiationIac" : "discardSubnegotiation";
    return true;
  }

  function filter(input) {
    const data = Buffer.isBuffer(input) ? input : Buffer.from(input);
    const output = [];

    for (const byte of data) {
      if (state.startsWith("subnegotiation") && exceedsSubnegotiationLimit(byte)) {
        continue;
      }

      if (state === "data") {
        if (byte === IAC) {
          state = "iac";
        } else {
          output.push(byte);
        }
        continue;
      }

      if (state === "iac") {
        if (byte === IAC) {
          output.push(IAC);
          resetSequence();
        } else if (byte === SB) {
          state = "subnegotiationOption";
          sequenceBytes = 2;
        } else if (negotiationCommands.has(byte)) {
          state = "negotiationOption";
          command = byte;
        } else {
          emitCommand(byte);
          resetSequence();
        }
        continue;
      }

      if (state === "negotiationOption") {
        emitCommand(command, byte);
        resetSequence();
        continue;
      }

      if (state === "subnegotiationOption") {
        option = byte;
        state = "subnegotiationData";
        continue;
      }

      if (state === "subnegotiationData") {
        if (byte === IAC) {
          state = "subnegotiationIac";
        } else {
          payload.push(byte);
        }
        continue;
      }

      if (state === "subnegotiationIac") {
        if (byte === IAC) {
          payload.push(IAC);
          state = "subnegotiationData";
        } else if (byte === SE) {
          emitSubnegotiation();
          resetSequence();
        } else {
          logger?.warn?.("dropping malformed Telnet IAC subnegotiation");
          resetSequence();
        }
        continue;
      }

      if (state === "discardSubnegotiationIac") {
        if (byte === SE) resetSequence();
        else state = "discardSubnegotiation";
      } else if (byte === IAC) {
        state = "discardSubnegotiationIac";
      }
    }

    return Buffer.from(output);
  }

  return { filter };
}

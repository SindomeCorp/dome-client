import { dome, logger } from "./b-variables.js";

dome.autoCommands = [];

const SUGGESTION_INPUT_GAP_PX = 16;
const SUGGESTION_ROW_HEIGHT_PX = 24;

const getSuggestionListHeight = (list, availableHeight) => {
  const measuredHeight = list.getBoundingClientRect().height
    || list.offsetHeight
    || list.scrollHeight
    || (list.children.length * SUGGESTION_ROW_HEIGHT_PX);

  return Math.min(measuredHeight, availableHeight);
};

const positionSuggestionList = ({ list, inputBuffer, win = globalThis.window }) => {
  const rect = inputBuffer.getBoundingClientRect();
  const availableAbove = Math.max(0, rect.top - SUGGESTION_INPUT_GAP_PX);
  const listHeight = getSuggestionListHeight(list, availableAbove);
  const top = Math.max(
    win.scrollY,
    rect.top + win.scrollY - listHeight - SUGGESTION_INPUT_GAP_PX
  );

  list.style.position = "absolute";
  list.style.left = `${rect.left + win.scrollX}px`;
  list.style.width = `${rect.width}px`;
  list.style.maxHeight = `${availableAbove}px`;
  list.style.overflowY = "auto";
  list.style.top = `${top}px`;
};

export function setupAutoCompleteFeature({
  client = dome,
  doc = globalThis.document,
  win = globalThis.window,
  fetchFn = (...args) => globalThis.fetch(...args),
  log = logger
} = {}) {
  const commandArgumentPattern = /<[-A-Z a-z]+>/g;

  const prettyCommandArguments = (unformattedString) => {
    return (unformattedString.match(commandArgumentPattern) || []).reduce(
      (out, commandArg) =>
        out.replace(
          commandArg,
          `<i>&lt;${commandArg.substring(1, commandArg.length - 1)}&gt;</i>`
        ),
      unformattedString
    );
  };

  client.autoCommands = [];

  client.setupAutoComplete = async (inputBuffer, userType) => {
    if (
      !inputBuffer ||
      (win.location.search && win.location.search.includes("ac=no"))
    ) {
      return;
    }

    if (client.autoCommands.length > 0) {
      if (typeof inputBuffer.commandSuggestions === "function") {
        inputBuffer.commandSuggestions("destroy");
      }
    }

    try {
      const res = await fetchFn(`/ac/${userType}`);
      const data = await res.json();
      client.autoCommands = data.reduce((out, line) => {
        let commandValue = line.trim();
        let commandSearch = commandValue;
        let commandHelp = `<div class="command-syntax">${commandValue}</div>`;
        const parts = commandValue.split("|");
        if (parts.length > 1) {
          commandValue = parts[0].trim();
          commandSearch = commandValue;
          const commandSyntax = commandSearch;
          const commandParts = commandValue.split(" ");
          if (commandParts.length > 1) {
            commandValue = commandParts[0];
          }
          commandHelp = `<div class="command-syntax">${prettyCommandArguments(
            commandSyntax
          )}</div>`;
          const commandInstruction = parts[1].trim();
          if (client.preferences.broadSearch) {
            commandSearch += commandInstruction;
          }
          commandHelp += `<div class="command-instruction">${prettyCommandArguments(
            commandInstruction
          )}</div>`;
          if (parts.length > 2 && parts[2] !== "") {
            const commandRequires = parts[2].trim();
            if (client.preferences.broadSearch) {
              commandSearch += commandRequires;
            }
            commandHelp += `<div class="command-requires">${commandRequires}</div>`;
          }
        }
        out[out.length] = {
          label: commandSearch,
          display: `<a>${commandHelp}</a>`,
          value: commandValue
        };
        return out;
      }, []);

      const options = {
        delay: 0,
        minLength: 2,
        source(req, next) {
          const term = new RegExp(
            (req.term.length === 2 ? "^" : "") + req.term
          );
          const matches = client.autoCommands.filter((item) =>
            term.test(item.label)
          );
          next(matches);
        }
      };

      if (typeof inputBuffer.commandSuggestions === "function") {
        inputBuffer.commandSuggestions(options);
      } else {
        const list = doc.createElement("ul");
        list.className = "command-suggestions ui-autocomplete ui-front";
        list.style.display = "none";
        list.style.zIndex = "1000";
        doc.body.appendChild(list);

        const render = (matches) => {
          list.innerHTML = "";
          if (matches.length === 0) {
            list.style.display = "none";
            return;
          }
          matches.forEach((item) => {
            const li = doc.createElement("li");
            li.className = "ui-menu-item";
            li.innerHTML = item.display;
            li.addEventListener("mousedown", (e) => {
              e.preventDefault();
              inputBuffer.value = item.value;
              list.style.display = "none";
            });
            list.appendChild(li);
          });
          list.style.display = "block";
          positionSuggestionList({ list, inputBuffer, win });
        };

        const onInput = () => {
          const term = inputBuffer.value;
          if (term.length < inputBuffer.commandSuggestionsOptions.minLength) {
            list.style.display = "none";
            return;
          }
          inputBuffer.commandSuggestionsOptions.source({ term }, render);
        };

        inputBuffer.commandSuggestions = function (arg) {
          if (typeof arg === "string") {
            if (arg === "destroy") {
              inputBuffer.removeEventListener("input", onInput);
              list.remove();
              delete inputBuffer.commandSuggestionsOptions;
            } else if (arg === "close") {
              list.style.display = "none";
            }
            return;
          }
          inputBuffer.commandSuggestionsOptions = arg;
          inputBuffer.addEventListener("input", onInput);
        };
        inputBuffer.commandSuggestions(options);
      }
    } catch (err) {
      log.warn(`Failed to load autocomplete commands: ${err}`);
    }
  };
}

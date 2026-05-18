import { dome, logger } from "./b-variables.js";

dome.autoCommands = [];

dome.autoComplete = () => {
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

  dome.autoCommands = [];

  dome.setupAutoComplete = async (inputBuffer, userType) => {
    if (
      !inputBuffer ||
      (window.location.search && window.location.search.includes("ac=no"))
    ) {
      return;
    }

    if (dome.autoCommands.length > 0) {
      if (typeof inputBuffer.commandSuggestions === "function") {
        inputBuffer.commandSuggestions("destroy");
      }
    }

    try {
      const res = await fetch(`/ac/${userType}`);
      const data = await res.json();
      dome.autoCommands = data.reduce((out, line) => {
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
          if (dome.preferences.broadSearch) {
            commandSearch += commandInstruction;
          }
          commandHelp += `<div class="command-instruction">${prettyCommandArguments(
            commandInstruction
          )}</div>`;
          if (parts.length > 2 && parts[2] !== "") {
            const commandRequires = parts[2].trim();
            if (dome.preferences.broadSearch) {
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
          const matches = dome.autoCommands.filter((item) =>
            term.test(item.label)
          );
          next(matches);
        }
      };

      if (typeof inputBuffer.commandSuggestions === "function") {
        inputBuffer.commandSuggestions(options);
      } else {
        const list = document.createElement("ul");
        list.className = "command-suggestions ui-autocomplete ui-front";
        list.style.display = "none";
        list.style.zIndex = "1000";
        document.body.appendChild(list);

        const render = (matches) => {
          list.innerHTML = "";
          if (matches.length === 0) {
            list.style.display = "none";
            return;
          }
          matches.forEach((item) => {
            const li = document.createElement("li");
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
          const rect = inputBuffer.getBoundingClientRect();
          const top = Math.max(
            0,
            rect.top + window.scrollY - list.offsetHeight
          );
          list.style.position = "absolute";
          list.style.left = `${rect.left + window.scrollX}px`;
          list.style.width = `${rect.width}px`;
          list.style.top = `${top}px`;
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
      logger.warn(`Failed to load autocomplete commands: ${err}`);
    }
  };
};

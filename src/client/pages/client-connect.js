import logger from "./logger.js";
import { store } from "../store.js";
import { savedUsersStore } from "../saved-users-store.js";
import {
  DEFAULT_MUD_HOST,
  DEFAULT_MUD_PORT,
  buildMooConnectCommand,
  buildPlayerClientUrl,
  resolvePlayerClientAddress
} from "../client-connect-intent.js";

function getParameterByName(name) {
  const match = RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
  return match && decodeURIComponent(match[1].replace(/\+/g, " "));
}

const connectFunction = function() {
  const u = document.getElementById("moo-username").value;
  const p = document.getElementById("moo-password").value;
  const cmd = buildMooConnectCommand({ username: u, password: p });
  if ( cmd ) {
    savedUsersStore.addUser({ "username": u, "password": p });
    store.put("last-username", u);
    //store.put('dc-password', p);
    store.put("dc-user-login", cmd);
  }
  const hostField = document.getElementById("moo-hostname");
  const portField = document.getElementById("moo-port");
  const { host, port } = resolvePlayerClientAddress({
    host: hostField?.value,
    port: portField?.value
  });
  store.put("game-hostname", host);
  store.put("game-port", port);
  window.location = buildPlayerClientUrl({ host, port });
};

document.addEventListener("DOMContentLoaded", () => {
  // allow scrolling without showing a scrollbar
  document.body.style.overflowY = "auto";
  document.body.style.msOverflowStyle = "none";
  document.body.style.scrollbarWidth = "none";
  const hideScrollbar = document.createElement("style");
  hideScrollbar.textContent = "body::-webkit-scrollbar { display: none; }";
  document.head.appendChild(hideScrollbar);

  const b = document.body;
  const bg = window.getComputedStyle(b).backgroundImage;
  if (bg && bg !== "none") {
    b.style.backgroundImage = "none";
    window.setTimeout(() => { b.style.backgroundImage = bg; }, 10);
  }

  const gogo = getParameterByName("auto");
  const usernames = savedUsersStore.getUsernames();
  const gameHostname = DEFAULT_MUD_HOST;
  const gamePort = DEFAULT_MUD_PORT;

  const usernamePicker = document.getElementById("user-picker");
  const usernamePickerLabel = usernamePicker ? usernamePicker.querySelector(".user-picker-label") : null;
  const usernamePickerToggle = usernamePicker ? usernamePicker.querySelector(".dropdown-toggle") : null;
  const usernameField = document.getElementById("moo-username");
  const passwordField = document.getElementById("moo-password");
  const hostnameField = document.getElementById("moo-hostname");
  const portField = document.getElementById("moo-port");
  if (hostnameField && !hostnameField.value) {
    hostnameField.value = gameHostname;
  }
  if (portField && !portField.value) {
    portField.value = gamePort;
  }

  if (usernameField && passwordField) {
    const readyUser = function(u, p) {
      if (usernamePickerLabel != null) {
        usernamePickerLabel.textContent = u;
      }
      usernameField.value = u;
      passwordField.value = p;
    };

    if (usernames.length > 0 && usernamePicker && usernamePickerLabel) {
      // drop-down picker
      usernameField.style.display = "none";

      const charsMenu = usernamePicker ? usernamePicker.querySelector(".dropdown-menu") : null;
      let charsList = [];
      if (charsMenu) {
        const entries = Array.from(charsMenu.querySelectorAll("li.character"));
        charsList = entries.map(entry => entry.textContent.toLowerCase());
      }

      if (charsList.length > 0) {
        logger.info(`Preset characters: ${charsList.join(", ")}`);
      }

      const divider = usernamePicker ? usernamePicker.querySelector(".divider") : null;
      for (let i = 0; i < usernames.length; i++) {
        const uname = usernames[i];
        if (charsList.includes(uname.toLowerCase())) {
          continue;
        }
        if (divider) {
          divider.insertAdjacentHTML("beforebegin", `<li class="username" data-username="${uname}">${uname}</li>`);
        }
      }

      usernamePicker.querySelectorAll("ul.dropdown-menu li:not(.divider)").forEach((li) => {
        li.setAttribute("tabindex", "-1");
      });

      let bestUser = null;
      if (gogo) {
        bestUser = savedUsersStore.getUser(gogo);
      }

      if (!bestUser) {
        bestUser = savedUsersStore.getUser(usernames[0]);
      }

      if (bestUser) {
        readyUser(bestUser.username, bestUser.password);
      }

      const userOptions = usernamePicker ? usernamePicker.querySelector("ul.dropdown-menu") : null;
      if (userOptions) {
        userOptions.addEventListener("click", (e) => {
          const clicked = e.target;
          if (clicked.classList.contains("username") || clicked.classList.contains("character")) {
            // clicked username
            const usernameClicked = clicked.getAttribute("data-username");
            let user = savedUsersStore.getUser(usernameClicked);
            if (!user) {
              user = { username: usernameClicked, password: "" };
            }
            readyUser(user.username, user.password);
          } else if (clicked.classList.contains("command")) {
            const command = clicked.getAttribute("data-command");
            logger.info(`Command selected: ${command}`);
            if (command == "purgeAll") {
              if (window.confirm("You really want to delete all local user profiles?")) {
                savedUsersStore.purge();
                window.location.reload();
              }
            } else if (command == "newChar") {
              const newName = window.prompt("What is your character name?");
              readyUser(newName, "");
              passwordField.focus();
            }
          }
        });
      }

      if (usernamePicker && usernamePickerToggle) {
        const pickerMenu = usernamePicker.querySelector(".dropdown-menu");
        const closeMenu = () => {
          usernamePicker.classList.remove("open");
          usernamePickerToggle.setAttribute("aria-expanded", "false");
          usernamePickerToggle.focus();
          document.removeEventListener("keydown", onKeydown);
          document.removeEventListener("click", onDocClick);
        };
        const onKeydown = (e) => {
          if (e.key === "Escape") {
            closeMenu();
          }
        };
        const onDocClick = (e) => {
          if (!usernamePicker.contains(e.target)) {
            closeMenu();
          }
        };
        usernamePickerToggle.setAttribute("aria-expanded", "false");
        usernamePickerToggle.addEventListener("click", (e) => {
          e.preventDefault();
          if (usernamePicker.classList.contains("open")) {
            closeMenu();
          } else {
            usernamePicker.classList.add("open");
            usernamePickerToggle.setAttribute("aria-expanded", "true");
            const firstItem = pickerMenu.querySelector("li:not(.divider)");
            if (firstItem) {
              firstItem.focus();
            }
            document.addEventListener("keydown", onKeydown);
            document.addEventListener("click", onDocClick);
          }
        });
      }

      usernamePicker.classList.remove("hide");
    } else {
      // input field
    }

    document.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        if (usernameField.value && passwordField.value) {
          // enter key
          connectFunction();
        }
      }
    });

    if (gogo) {
      logger.info(`Auto-connect parameter: ${gogo}`);
      const user = savedUsersStore.getUser(gogo);
      if (user) {
        // we can auto launch
        connectFunction();
      }
    }
  }

  document.querySelectorAll(".btn-connect-guest").forEach((guest) => {
    guest.addEventListener("click", (e) => {
      e.preventDefault();
      store.put("dc-initial-command", window.guestConnectCommand || "connect guest");
      window.location = "/player-client/";
    });
  });

  // connect as [someone] using [password]
  const connect = document.getElementById("connect_as");
  if (connect) {
    connect.addEventListener("click", connectFunction);
  }

  document.querySelectorAll(".btn-connect-other").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      store.remove("dc-user-login");
      store.remove("dc-initial-command");
      window.location = "/player-client/";
    });
  });

  const connectNow = document.getElementById("connect_now");
  if (connectNow) {
    connectNow.addEventListener("click", (event) => {
      event.preventDefault();
      connectFunction();
    });
  }

  const contactPanel = document.getElementById("contact_panel");
  const addressPanel = document.getElementById("address_panel");
  const nextButton = document.getElementById("next_btn");
  if (nextButton && contactPanel && addressPanel) {
    nextButton.addEventListener("click", (event) => {
      event.preventDefault();
      contactPanel.classList.remove("hidden-panel");
      addressPanel.classList.add("hidden-panel");
    });
  }
  const backButton = document.getElementById("back_btn");
  if (backButton && contactPanel && addressPanel) {
    backButton.addEventListener("click", (event) => {
      event.preventDefault();
      addressPanel.classList.remove("hidden-panel");
      contactPanel.classList.add("hidden-panel");
    });
  }
});

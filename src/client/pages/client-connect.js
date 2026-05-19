import logger from "./logger.js";
import { store } from "../store.js";

function getParameterByName(name) {
  const match = RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
  return match && decodeURIComponent(match[1].replace(/\+/g, " "));
}

const gogo = getParameterByName("auto");

const connectFunction = function() {
  const u = document.getElementById("moo-username").value;
  const p = document.getElementById("moo-password").value;
  let cmd = "";
  if ( u && p ) {
    // both username and password
    cmd = "connect " + u + " " + p;
  } else if ( u ) {
    // just username
    cmd = "connect " + u;
  }
  if ( cmd ) {
    store.addUser({"username" : u, "password" : p });
    store.put("last-username", u);
    //store.put('dc-password', p);
    store.put("dc-user-login", cmd);
  }
  window.location = "/player-client/";
};

store.getUsernames = function() {
  let users = this.get("stored-users");
  if (!users) {
    users = [];
  }
  return users;
};

store.getUser = function(username) {
  const key = username.toLowerCase();
  const pwd = this.get("user-" + key + "-passwd");
  if (pwd) {
    return { "username": key, "password": pwd };
  }
  return null;
};

store.addUser = function(user) {
  const username = user.username.toLowerCase();
  const password = user.password;

  const users = this.getUsernames();
  if (!users.includes(username)) {
    users.push(username);
  }
  this.put("user-" + username + "-passwd", password);
  this.put("stored-users", users);
};

store.purge = function() {
  const usernames = this.getUsernames();
  for (let i = 0; i < usernames.length; i++) {
    this.remove("user-" + usernames[i] + "-passwd");
  }
  this.remove("stored-users");
  this.remove("dc-user-login");
  this.remove("last-username");
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

  // old school check
  const storedUsername = store.get("dc-username"); // old username format
  const storedPassword = store.get("dc-password"); // old password format
  if (storedUsername && storedPassword) {
    // convert old values
    store.addUser({"username": storedUsername, "password": storedPassword});
  }
  // purge unmatched old pairs
  store.remove("dc-username");
  store.remove("dc-password");

  const usernames = store.getUsernames();

  const usernamePicker = document.getElementById("user-picker");
  const usernamePickerLabel = usernamePicker ? usernamePicker.querySelector(".user-picker-label") : null;
  const usernamePickerToggle = usernamePicker ? usernamePicker.querySelector(".dropdown-toggle") : null;
  const usernameField = document.getElementById("moo-username");
  const passwordField = document.getElementById("moo-password");
  const chromeWarning = document.getElementById("chrome-performance-warning");
  const chromeWarningClose = chromeWarning ? chromeWarning.querySelector(".close") : null;

  if (chromeWarning && chromeWarningClose) {
    const hideWarning = () => {
      chromeWarning.classList.add("hidden");
      (usernamePickerLabel || usernameField || document.querySelector(".btn-connect-guest"))?.focus();
      document.removeEventListener("keydown", escWarning);
    };
    const escWarning = (e) => {
      if (e.key === "Escape") {
        hideWarning();
      }
    };
    chromeWarningClose.addEventListener("click", (e) => {
      e.preventDefault();
      hideWarning();
    });
    chromeWarningClose.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        hideWarning();
      }
    });
    document.addEventListener("keydown", escWarning);
  }

  if (usernameField && passwordField) {
    const readyUser = function(u, p) {
      if (usernamePickerLabel != null) {
        usernamePickerLabel.textContent = u;
      }
      usernameField.value = u;
      passwordField.value = p;
    };

    if (usernames.length > 0) {
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
        bestUser = store.getUser(gogo);
      }

      if (!bestUser) {
        bestUser = store.getUser(usernames[0]);
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
            let user = store.getUser(usernameClicked);
            if (!user) {
              user = { username: usernameClicked, password: "" };
            }
            readyUser(user.username, user.password);
          } else if (clicked.classList.contains("command")) {
            const command = clicked.getAttribute("data-command");
            logger.info(`Command selected: ${command}`);
            if (command == "purgeAll") {
              if (window.confirm("You really want to delete all local user profiles?")) {
                store.purge();
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

      if (usernamePicker) {
        usernamePicker.classList.remove("hide");
      }
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
      const user = store.getUser(gogo);
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
});

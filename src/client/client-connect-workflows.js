import {
  buildMooConnectCommand,
  buildPlayerClientUrl,
  resolvePlayerClientAddress
} from "./client-connect-intent.js";

export function getParameterByName(name, locationSearch = globalThis.window?.location?.search || "") {
  const match = RegExp("[?&]" + name + "=([^&]*)").exec(locationSearch);
  return match && decodeURIComponent(match[1].replace(/\+/g, " "));
}

export function createConnectAction({
  doc = globalThis.document,
  win = globalThis.window,
  store,
  savedUsersStore
}) {
  return function connect() {
    const username = doc.getElementById("moo-username").value;
    const password = doc.getElementById("moo-password").value;
    const command = buildMooConnectCommand({ username, password });
    if (command) {
      savedUsersStore.addUser({ username, password });
      store.put("last-username", username);
      store.put("dc-user-login", command);
    }
    const hostField = doc.getElementById("moo-hostname");
    const portField = doc.getElementById("moo-port");
    const { host, port } = resolvePlayerClientAddress({
      host: hostField?.value,
      port: portField?.value
    });
    store.put("game-hostname", host);
    store.put("game-port", port);
    win.location = buildPlayerClientUrl({ host, port });
  };
}

export function setupConnectPageChrome({ doc = globalThis.document, win = globalThis.window }) {
  doc.body.style.overflowY = "auto";
  doc.body.style.msOverflowStyle = "none";
  doc.body.style.scrollbarWidth = "none";
  const hideScrollbar = doc.createElement("style");
  hideScrollbar.textContent = "body::-webkit-scrollbar { display: none; }";
  doc.head.appendChild(hideScrollbar);

  const body = doc.body;
  const backgroundImage = win.getComputedStyle(body).backgroundImage;
  if (backgroundImage && backgroundImage !== "none") {
    body.style.backgroundImage = "none";
    win.setTimeout(() => {
      body.style.backgroundImage = backgroundImage;
    }, 10);
  }
}

export function initializeAddressFields({ doc = globalThis.document, host, port }) {
  const hostnameField = doc.getElementById("moo-hostname");
  const portField = doc.getElementById("moo-port");
  if (hostnameField && !hostnameField.value) {
    hostnameField.value = host;
  }
  if (portField && !portField.value) {
    portField.value = port;
  }
}

export function bindSavedUserPicker({
  doc = globalThis.document,
  win = globalThis.window,
  logger,
  savedUsersStore,
  usernames,
  autoUser
}) {
  const usernamePicker = doc.getElementById("user-picker");
  const usernamePickerLabel = usernamePicker ? usernamePicker.querySelector(".user-picker-label") : null;
  const usernamePickerToggle = usernamePicker ? usernamePicker.querySelector(".dropdown-toggle") : null;
  const usernameField = doc.getElementById("moo-username");
  const passwordField = doc.getElementById("moo-password");
  if (!usernameField || !passwordField || usernames.length === 0 || !usernamePicker || !usernamePickerLabel) {
    return;
  }

  const readyUser = function(username, password) {
    usernamePickerLabel.textContent = username;
    usernameField.value = username;
    passwordField.value = password;
  };

  usernameField.style.display = "none";
  const charsMenu = usernamePicker.querySelector(".dropdown-menu");
  const charsList = charsMenu
    ? Array.from(charsMenu.querySelectorAll("li.character")).map(entry => entry.textContent.toLowerCase())
    : [];

  if (charsList.length > 0) {
    logger.info(`Preset characters: ${charsList.join(", ")}`);
  }

  const divider = usernamePicker.querySelector(".divider");
  usernames.forEach((username) => {
    if (charsList.includes(username.toLowerCase())) return;
    divider?.insertAdjacentHTML("beforebegin", `<li class="username" data-username="${username}">${username}</li>`);
  });

  usernamePicker.querySelectorAll("ul.dropdown-menu li:not(.divider)").forEach((li) => {
    li.setAttribute("tabindex", "-1");
  });

  const bestUser = (autoUser ? savedUsersStore.getUser(autoUser) : null) || savedUsersStore.getUser(usernames[0]);
  if (bestUser) {
    readyUser(bestUser.username, bestUser.password);
  }

  bindSavedUserMenu({ doc, win, logger, savedUsersStore, usernamePicker, passwordField, readyUser });
  bindPickerToggle({ doc, usernamePicker, usernamePickerToggle });
  usernamePicker.classList.remove("hide");
}

function bindSavedUserMenu({
  win,
  logger,
  savedUsersStore,
  usernamePicker,
  passwordField,
  readyUser
}) {
  const userOptions = usernamePicker.querySelector("ul.dropdown-menu");
  if (!userOptions) return;
  userOptions.addEventListener("click", (event) => {
    const clicked = event.target;
    if (clicked.classList.contains("username") || clicked.classList.contains("character")) {
      const usernameClicked = clicked.getAttribute("data-username");
      const user = savedUsersStore.getUser(usernameClicked) || { username: usernameClicked, password: "" };
      readyUser(user.username, user.password);
      return;
    }
    if (!clicked.classList.contains("command")) return;
    const command = clicked.getAttribute("data-command");
    logger.info(`Command selected: ${command}`);
    if (command === "purgeAll" && win.confirm("You really want to delete all local user profiles?")) {
      savedUsersStore.purge();
      win.location.reload();
    } else if (command === "newChar") {
      const newName = win.prompt("What is your character name?");
      readyUser(newName, "");
      passwordField.focus();
    }
  });
}

function bindPickerToggle({ doc, usernamePicker, usernamePickerToggle }) {
  if (!usernamePickerToggle) return;
  const pickerMenu = usernamePicker.querySelector(".dropdown-menu");
  const closeMenu = () => {
    usernamePicker.classList.remove("open");
    usernamePickerToggle.setAttribute("aria-expanded", "false");
    usernamePickerToggle.focus();
    doc.removeEventListener("keydown", onKeydown);
    doc.removeEventListener("click", onDocClick);
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  };
  const onDocClick = (event) => {
    if (!usernamePicker.contains(event.target)) {
      closeMenu();
    }
  };
  usernamePickerToggle.setAttribute("aria-expanded", "false");
  usernamePickerToggle.addEventListener("click", (event) => {
    event.preventDefault();
    if (usernamePicker.classList.contains("open")) {
      closeMenu();
      return;
    }
    usernamePicker.classList.add("open");
    usernamePickerToggle.setAttribute("aria-expanded", "true");
    pickerMenu?.querySelector("li:not(.divider)")?.focus();
    doc.addEventListener("keydown", onKeydown);
    doc.addEventListener("click", onDocClick);
  });
}

export function bindConnectPageActions({
  doc = globalThis.document,
  win = globalThis.window,
  store,
  connect,
  guestConnectCommand
}) {
  const usernameField = doc.getElementById("moo-username");
  const passwordField = doc.getElementById("moo-password");
  if (usernameField && passwordField) {
    doc.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && !event.shiftKey && usernameField.value && passwordField.value) {
        connect();
      }
    });
  }

  doc.querySelectorAll(".btn-connect-guest").forEach((guest) => {
    guest.addEventListener("click", (event) => {
      event.preventDefault();
      store.put("dc-initial-command", guestConnectCommand || "connect guest");
      win.location = "/player-client/";
    });
  });

  doc.getElementById("connect_as")?.addEventListener("click", connect);
  doc.getElementById("connect_now")?.addEventListener("click", (event) => {
    event.preventDefault();
    connect();
  });

  doc.querySelectorAll(".btn-connect-other").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      store.remove("dc-user-login");
      store.remove("dc-initial-command");
      win.location = "/player-client/";
    });
  });
}

export function bindConnectPanelNavigation({ doc = globalThis.document }) {
  const contactPanel = doc.getElementById("contact_panel");
  const addressPanel = doc.getElementById("address_panel");
  const nextButton = doc.getElementById("next_btn");
  if (nextButton && contactPanel && addressPanel) {
    nextButton.addEventListener("click", (event) => {
      event.preventDefault();
      contactPanel.classList.remove("hidden-panel");
      addressPanel.classList.add("hidden-panel");
    });
  }
  const backButton = doc.getElementById("back_btn");
  if (backButton && contactPanel && addressPanel) {
    backButton.addEventListener("click", (event) => {
      event.preventDefault();
      addressPanel.classList.remove("hidden-panel");
      contactPanel.classList.add("hidden-panel");
    });
  }
}

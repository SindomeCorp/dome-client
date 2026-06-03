import { store } from "../../core/store.js";

const STORED_USERS_KEY = "stored-users";
const LAST_USERNAME_KEY = "last-username";
const USER_LOGIN_KEY = "dc-user-login";

function normalizeUsername(username) {
  return String(username || "").toLowerCase();
}

function passwordKey(username) {
  return `user-${normalizeUsername(username)}-passwd`;
}

function createSavedUsersStore(storage = store) {
  function getUsernames() {
    return storage.get(STORED_USERS_KEY) || [];
  }

  function getUser(username) {
    const key = normalizeUsername(username);
    const password = storage.get(passwordKey(key));
    if (password) {
      return { username: key, password };
    }
    return null;
  }

  function addUser(user) {
    const username = normalizeUsername(user.username);
    const password = user.password;

    const usernames = getUsernames();
    if (!usernames.includes(username)) {
      usernames.push(username);
    }
    storage.put(passwordKey(username), password);
    storage.put(STORED_USERS_KEY, usernames);
  }

  function purge() {
    const usernames = getUsernames();
    for (let i = 0; i < usernames.length; i++) {
      storage.remove(passwordKey(usernames[i]));
    }
    storage.remove(STORED_USERS_KEY);
    storage.remove(USER_LOGIN_KEY);
    storage.remove(LAST_USERNAME_KEY);
  }

  return { getUsernames, getUser, addUser, purge };
}

const savedUsersStore = createSavedUsersStore(store);

export {
  createSavedUsersStore,
  savedUsersStore
};

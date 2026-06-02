import { test } from "node:test";
import assert from "node:assert/strict";
import { createSavedUsersStore } from "../../src/client/saved-users-store.js";

function createMemoryStorage(initialEntries = []) {
  const memory = new Map(initialEntries);
  return {
    memory,
    get: (key) => memory.has(key) ? memory.get(key) : null,
    put: (key, value) => memory.set(key, value),
    remove: (key) => memory.delete(key)
  };
}

test("saved users store lowercases usernames and stores passwords", () => {
  const storage = createMemoryStorage();
  const savedUsers = createSavedUsersStore(storage);

  savedUsers.addUser({ username: "Hero", password: "pass" });

  assert.deepEqual(savedUsers.getUsernames(), ["hero"]);
  assert.deepEqual(savedUsers.getUser("HERO"), {
    username: "hero",
    password: "pass"
  });
  assert.equal(storage.memory.get("user-hero-passwd"), "pass");
});

test("saved users store preserves username order without duplicates", () => {
  const storage = createMemoryStorage();
  const savedUsers = createSavedUsersStore(storage);

  savedUsers.addUser({ username: "Hero", password: "first" });
  savedUsers.addUser({ username: "Guest", password: "second" });
  savedUsers.addUser({ username: "hero", password: "updated" });

  assert.deepEqual(savedUsers.getUsernames(), ["hero", "guest"]);
  assert.deepEqual(savedUsers.getUser("hero"), {
    username: "hero",
    password: "updated"
  });
});

test("saved users store purge removes profiles and login metadata", () => {
  const storage = createMemoryStorage([
    ["stored-users", ["hero", "guest"]],
    ["user-hero-passwd", "pass"],
    ["user-guest-passwd", ""],
    ["dc-user-login", "connect hero pass"],
    ["last-username", "hero"]
  ]);
  const savedUsers = createSavedUsersStore(storage);

  savedUsers.purge();

  assert.equal(storage.memory.has("stored-users"), false);
  assert.equal(storage.memory.has("user-hero-passwd"), false);
  assert.equal(storage.memory.has("user-guest-passwd"), false);
  assert.equal(storage.memory.has("dc-user-login"), false);
  assert.equal(storage.memory.has("last-username"), false);
});

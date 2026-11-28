import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { bootServer } from "./helpers/boot-server.js";

test("the public router connects the landing, editor, output, autocomplete and log handlers", async (t) => {
  const { baseUrl } = await bootServer(t, {
    remoteAuth: { enabled: false },
    status: { serviceUrl: "" },
    autocomplete: { enabled: false }
  });
  const http = request(baseUrl);
  await http.get("/").expect(200);
  await http.post("/").expect(200);
  await http.get("//").expect(200);
  await http.post("//").expect(200);
  const player = await http.get("/player-client/").expect(200);
  assert.match(player.text, /player-client\.(?:min\.)?js/);
  const output = await http.get("/output-window/").expect(200);
  assert.match(output.text, /output-window\.js/);
  const editor = await http.get("/editor/ide/").expect(200);
  assert.match(editor.text, /ide-editor-window\.js/);
  await http.get("/ac/p").expect(200, []);
  await http.post("/website-login/").type("form").send({ email: "fixture" }).expect(302).expect("Location", "/");
  const log = await http.post("/save/fixture.html").type("form").send({ buffer: "fixture text" }).expect(200);
  assert.match(log.text, /fixture text/);
  assert.match(log.text, /Source Code Pro[^;]*Liberation Mono[^;]*DejaVu Sans Mono/);
});

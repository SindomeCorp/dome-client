import { test, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import less from "less";
import lessMiddleware from "../../src/middleware/less-middleware.js";

test("serves compiled css and creates dest directory", async () => {
  const readFile = mock.fn(async () => "@w: (1 + 1);\nbody { width: @w; }");
  const mkdir = mock.fn(async () => {});
  const writeFile = mock.fn(async () => {});
  const fs = { readFile, mkdir, writeFile };
  const req = { url: "/style.css" };
  const headers = {};
  let body = "";
  const res = {
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    end(v) {
      body = v;
    }
  };
  const mw = lessMiddleware("/less", { dest: "/public" }, fs);
  await mw(req, res, () => {});
  assert.match(body, /width: 2/);
  assert.equal(headers["content-type"], "text/css");
  assert.equal(writeFile.mock.calls[0].arguments[0], path.join("/public", "style.css"));
  assert.equal(writeFile.mock.calls[0].arguments[1], body);
  assert.equal(mkdir.mock.calls[0].arguments[0], path.join("/public"));
});

test("preprocess.path adjusts pathname", async () => {
  const src = "/less";
  const dest = "/public";
  const readFile = mock.fn(async () => "body { width: 2; }");
  const mkdir = mock.fn(async () => {});
  const writeFile = mock.fn(async () => {});
  const fs = { readFile, mkdir, writeFile };
  const req = { url: "/css/client.css" };
  const res = { setHeader() {}, end() {} };
  const mw = lessMiddleware(
    src,
    {
      dest,
      preprocess: {
        path: pathname => pathname.replace(path.sep + "css" + path.sep, path.sep)
      }
    },
    fs
  );
  await mw(req, res, () => {});
  assert.equal(readFile.mock.calls[0].arguments[0], path.join(src, "client.less"));
  assert.equal(writeFile.mock.calls[0].arguments[0], path.join(dest, "css", "client.css"));
  assert.equal(mkdir.mock.calls[0].arguments[0], path.join(dest, "css"));
});

test("calls next with readFile error", async () => {
  const err = new Error("fail");
  const readFile = mock.fn(async () => {
    throw err;
  });
  const fs = { readFile };
  const mw = lessMiddleware(".", {}, fs);
  const req = { url: "/foo.css" };
  const res = {};
  let nextErr;
  await mw(req, res, e => {
    nextErr = e;
  });
  assert.strictEqual(nextErr, err);
});

test("middleware resolves nested paths and compiles", async () => {
  const src = "/less";
  const dest = "/public";
  const readFile = mock.fn(async () => "@w: (1 + 1);\nbody { width: @w; }");
  const mkdir = mock.fn(async () => {});
  const writeFile = mock.fn(async () => {});
  const fs = { readFile, mkdir, writeFile };
  const req = { url: "/nested/style.css" };
  const headers = {};
  const res = {
    setHeader(k, v) {
      headers[k] = v;
    },
    end: mock.fn()
  };
  const mw = lessMiddleware(src, { dest }, fs);
  await mw(req, res, () => {});
  assert.equal(readFile.mock.calls[0].arguments[0], path.join(src, "nested", "style.less"));
  assert.equal(writeFile.mock.calls[0].arguments[0], path.join(dest, "nested", "style.css"));
  assert.deepEqual(mkdir.mock.calls[0].arguments, [path.join(dest, "nested"), { recursive: true }]);
  assert.equal(headers["Content-Type"], "text/css");
  assert.match(res.end.mock.calls[0].arguments[0], /width: 2/);
});

test("calls next with render error", async () => {
  const err = new Error("render fail");
  mock.method(less, "render", async () => {
    throw err;
  });
  const readFile = mock.fn(async () => "body { width: 2; }");
  const fs = { readFile };
  const mw = lessMiddleware(".", {}, fs);
  const req = { url: "/bar.css" };
  const res = {};
  let nextErr;
  await mw(req, res, e => {
    nextErr = e;
  });
  less.render.mock.restore();
  assert.strictEqual(nextErr, err);
});

test("lets non-stylesheet requests continue without touching the file system", async (t) => {
  const readFile = t.mock.fn();
  const next = t.mock.fn();
  const middleware = lessMiddleware("/less", {}, { readFile });

  await middleware({ url: "/notes.txt" }, {}, next);

  assert.equal(next.mock.callCount(), 1);
  assert.equal(readFile.mock.callCount(), 0);
});

test("replaces only the final CSS suffix and supplies the source filename to Less", async (t) => {
  const source = "body { color: red; }";
  const readFile = t.mock.fn(async () => source);
  const render = t.mock.method(less, "render", async () => ({ css: source }));
  const middleware = lessMiddleware("/less", {}, { readFile, mkdir: async () => {}, writeFile: async () => {} });

  await middleware({ url: "/themes.css/nested.css" }, { setHeader() {}, end() {} }, t.mock.fn());

  const filename = path.join("/less", "themes.css", "nested.less");
  assert.deepEqual(readFile.mock.calls[0].arguments, [filename, "utf8"]);
  assert.deepEqual(render.mock.calls[0].arguments, [source, { filename }]);
});

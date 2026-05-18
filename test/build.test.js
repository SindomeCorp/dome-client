/* eslint indent: ["error", 2], quotes: ["error", "double"], semi: ["error", "always"] */
import test from "node:test";
import assert from "node:assert/strict";

const fns = {
  compileLess() {},
  compileReactCss() {},
  compileJs() {},
  compileEjsScripts() {},
  copyAce() {}
};

test("build compiles assets", async t => {
  t.mock.method(fns, "compileLess");
  t.mock.method(fns, "compileReactCss");
  t.mock.method(fns, "compileJs");
  t.mock.method(fns, "compileEjsScripts");
  t.mock.method(fns, "copyAce");

  t.mock.module("../src/services/build.js", {
    namedExports: fns,
    defaultExport: async (options = {}) => {
      await Promise.all([
        fns.compileLess(),
        fns.compileReactCss(),
        fns.compileJs(options.jsOutDir),
        fns.compileEjsScripts(options.jsOutDir),
        fns.copyAce(options.aceOutDir)
      ]);
    }
  });

  const {
    default: build,
    compileLess,
    compileReactCss,
    compileJs,
    compileEjsScripts,
    copyAce
  } = await import("../src/services/build.js");

  await build();

  assert.strictEqual(compileLess.mock.calls.length, 1);
  assert.strictEqual(compileReactCss.mock.calls.length, 1);
  assert.strictEqual(compileJs.mock.calls.length, 1);
  assert.strictEqual(compileEjsScripts.mock.calls.length, 1);
  assert.strictEqual(copyAce.mock.calls.length, 1);
});

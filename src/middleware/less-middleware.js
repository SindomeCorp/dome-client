import fs from "node:fs/promises";
import path from "node:path";
import less from "less";

export default function(src, opts = {}, fsMod = fs) {
  const dest = opts.dest || src;
  const preprocess = opts.preprocess && opts.preprocess.path;
  const srcPath = path.resolve(src);
  return async function(req, res, next) {
    if (!req.url.endsWith(".css")) return next();
    const rawPath = path.posix.normalize(req.url);
    if (rawPath.includes("..")) return next();
    let pathname = rawPath;
    if (preprocess) {
      pathname = preprocess(pathname);
    }
    if (pathname.includes("..")) return next();
    pathname = pathname.replace(/^\/+/, "");
    const lessFile = path.join(src, pathname.replace(/\.css$/, ".less"));
    const resolvedLessFile = path.resolve(lessFile);
    if (path.relative(srcPath, resolvedLessFile).startsWith("..")) return next();
    try {
      const data = await fsMod.readFile(lessFile, "utf8");
      const output = await less.render(data, { filename: lessFile });
      const outPath = path.join(dest, rawPath.replace(/^\/+/, ""));
      await fsMod.mkdir(path.dirname(outPath), { recursive: true });
      await fsMod.writeFile(outPath, output.css, "utf8");
      res.setHeader("Content-Type", "text/css");
      res.end(output.css);
    } catch (err) {
      next(err);
    }
  };
}

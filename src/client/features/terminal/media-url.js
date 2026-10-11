export function getPreviewMedia(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  if (/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(parsed.pathname)) {
    return { type: "image", src: url };
  }
  if (/\.(mp4|gifv)$/i.test(parsed.pathname)) {
    if (/\.gifv$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\.gifv$/i, ".mp4");
      return { type: "video", src: parsed.href };
    }
    return { type: "video", src: url };
  }
  return null;
}

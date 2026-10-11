import test from "node:test";
import assert from "node:assert/strict";
import { getPreviewMedia } from "../../src/client/features/terminal/media-url.js";

test("image detection uses a case-insensitive pathname extension", () => {
  for (const extension of ["png", "jpg", "jpeg", "gif", "webp", "avif", "JPEG"]) {
    for (const suffix of ["", "?width=400&format=original", "#photo"]) {
      const url = `https://example.com/photo.${extension}${suffix}`;
      assert.deepEqual(getPreviewMedia(url), { type: "image", src: url });
    }
  }
  assert.equal(getPreviewMedia("HTTP://example.com/PHOTO.PNG").type, "image");
});

test("names, hosts, query strings and opaque keys cannot impersonate extensions", () => {
  for (const url of ["https://example.com/myjpgarticle", "https://png.example.com/",
    "https://example.com/view?file=photo.png", "https://example.com/view#photo.jpg",
    "https://example.com/photo.png/", "https://sindo.me/abc123",
    "https://example.com/photo.svg", "https://example.com/photo.png.exe",
    "ftp://example.com/photo.png", "file:///photo.jpg", "data:image/png;base64,abc",
    "/photo.png", "not a URL"]) {
    assert.equal(getPreviewMedia(url), null, url);
  }
});

test("video paths preserve query and fragment, including GIFV conversion", () => {
  const mp4 = "https://example.com/video.MP4?token=abc#frame";
  assert.deepEqual(getPreviewMedia(mp4), { type: "video", src: mp4 });
  assert.deepEqual(getPreviewMedia("https://example.com/video.GIFV?token=abc#frame"),
    { type: "video", src: "https://example.com/video.mp4?token=abc#frame" });
  assert.equal(getPreviewMedia("https://example.com/mp4article"), null);
  assert.equal(getPreviewMedia("https://example.com/photo.jpeg?format=mp4").type, "image");
});

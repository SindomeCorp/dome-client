import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  attachImagePreview,
  buildImagePreviewHtml,
  toggleImagePreview
} from "../../src/client/features/terminal/image-preview.js";

test("buildImagePreviewHtml creates image, video, and YouTube embeds", () => {
  assert.match(
    buildImagePreviewHtml({ imageId: "img1", url: "https://example.com/a.png" }),
    /<img class="shown-image" id="img1" src="https:\/\/example.com\/a.png"/
  );
  assert.match(
    buildImagePreviewHtml({ imageId: "vid1", url: "https://example.com/a.gifv" }),
    /<source type="video\/mp4" src="https:\/\/example.com\/a.mp4"/
  );
  assert.match(
    buildImagePreviewHtml({
      imageId: "yt1",
      url: "https://youtu.be/example",
      parseYouTubeID: () => "abc123",
      bufferWidth: 520
    }),
    /src="https:\/\/www.youtube.com\/embed\/abc123"/
  );
});

test("attachImagePreview writes preview markup into target element", () => {
  const dom = new JSDOM("<!doctype html><span></span>");
  const elem = dom.window.document.querySelector("span");

  attachImagePreview({
    elem,
    imageId: "img1",
    url: "https://example.com/a.png",
    parseYouTubeID: () => false
  });

  assert.equal(elem.querySelector("img")?.id, "img1");
});

test("toggleImagePreview shows and hides attached previews", () => {
  const dom = new JSDOM("<!doctype html><div><span id=\"simg1\"></span></div>");
  const buffer = dom.window.document.querySelector("div");
  const control = dom.window.document.createElement("i");
  control.className = "icon-chevron-up";
  const attachImage = (elem, imageId, url) => {
    elem.innerHTML = `<img id="${imageId}" src="${url}">`;
  };
  const logger = { debug: () => {} };

  toggleImagePreview({
    control,
    buffer,
    imageId: "img1",
    imageURL: "https://example.com/a.png",
    attachImage,
    logger
  });
  assert.ok(control.classList.contains("icon-chevron-down"));
  assert.equal(buffer.querySelector("img")?.id, "img1");

  toggleImagePreview({
    control,
    buffer,
    imageId: "img1",
    imageURL: "https://example.com/a.png",
    attachImage,
    logger
  });
  assert.ok(control.classList.contains("icon-chevron-up"));
  assert.equal(buffer.querySelector("span")?.innerHTML, "");
});

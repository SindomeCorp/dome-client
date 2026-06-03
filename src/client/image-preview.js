export function buildImagePreviewHtml({ imageId, url, parseYouTubeID, bufferWidth = 580 }) {
  const isVideo = url.toLowerCase().match(/mp4|gifv$/);
  const youTubeId = parseYouTubeID?.(url);
  let segment = `<br><a href="${url}" target="_blank">`;

  if (isVideo) {
    segment += `<video id="${imageId}" loop muted autoplay class="shown-image" style="max-width: 75%"><source type="video/mp4" src="${url.replace(/gifv$/, "mp4")}"></video>`;
  } else if (youTubeId) {
    const width = Math.min(bufferWidth - 20, 560);
    const height = Math.floor(width * 0.5652);
    segment += `<iframe id="${imageId}" class="shown-image" width="${width}" height="${height}" src="https://www.youtube.com/embed/${youTubeId}" frameborder="0" allowfullscreen></iframe>`;
  } else {
    segment += `<img class="shown-image" id="${imageId}" src="${url}" style="max-width: 75%">`;
  }
  segment += "</a><br>";

  return segment;
}

export function attachImagePreview({ elem, imageId, url, parseYouTubeID, buffer }) {
  elem.innerHTML = buildImagePreviewHtml({
    imageId,
    url,
    parseYouTubeID,
    bufferWidth: buffer?.clientWidth ?? 580
  });
}

export function toggleImagePreview({ control, buffer, imageId, imageURL, attachImage, logger }) {
  const span = buffer.querySelector(`span#s${imageId}`);
  if (!control || !span) {
    logger.debug(control, span, imageId);
    return;
  }

  if (control.classList.contains("icon-chevron-down")) {
    control.classList.remove("icon-chevron-down");
    control.classList.add("icon-chevron-up");
    span.innerHTML = "";
    return;
  }

  control.classList.remove("icon-chevron-up");
  control.classList.add("icon-chevron-down");
  attachImage(span, imageId, imageURL);
}

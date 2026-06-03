export function setupChevronToggle({ client } = {}) {
  if (!client.buffer) {
    return;
  }
  client.buffer.addEventListener("click", event => {
    const control = event.target.closest("i.icon-chevron-up, i.icon-chevron-down");
    if (!control) {
      return;
    }
    const { imageId, imageUrl } = control.dataset;
    if (!imageId || !imageUrl || typeof client.toggleImage !== "function") {
      return;
    }
    client.toggleImage(control, imageId, imageUrl);
  });
}

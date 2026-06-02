import { dome } from "./b-variables.js";

export function setupChevronToggle({ client = dome } = {}) {
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

dome.setupChevronToggle = () => setupChevronToggle({ client: dome });

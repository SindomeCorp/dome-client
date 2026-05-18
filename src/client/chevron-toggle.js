import { dome } from "./b-variables.js";

dome.setupChevronToggle = function() {
  if (!dome.buffer) {
    return;
  }
  dome.buffer.addEventListener("click", event => {
    const control = event.target.closest("i.icon-chevron-up, i.icon-chevron-down");
    if (!control) {
      return;
    }
    const { imageId, imageUrl } = control.dataset;
    if (!imageId || !imageUrl || typeof dome.toggleImage !== "function") {
      return;
    }
    dome.toggleImage(control, imageId, imageUrl);
  });
};


// This function is embedded in standalone downloads. Keep it self-contained:
// templates are inert until opened, and collapsing releases the media elements.
// Stryker disable all: Downloaded logs serialize this function and have no Stryker runtime.
function installLogPreviewControls(doc) {
  doc.addEventListener("click", (event) => {
    const control = event.target.closest?.("[data-output-media]");
    if (!control) return;
    const slot = control.nextElementSibling;
    const template = slot?.nextElementSibling;
    if (!slot?.matches("[data-preview-for]") || template?.tagName !== "TEMPLATE") return;
    const expanded = control.getAttribute("aria-expanded") === "true";
    slot.replaceChildren(...(expanded ? [] : [template.content.cloneNode(true)]));
    control.setAttribute("aria-expanded", String(!expanded));
    control.textContent = expanded ? "▸" : "▾";
  });
}

// Stryker restore all
export const logPreviewScript = "<script>(" + installLogPreviewControls.toString() + ")(document);</script>";

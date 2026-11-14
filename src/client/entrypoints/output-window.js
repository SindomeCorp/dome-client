// A companion is a view of its opener's session; never start a client/socket here.
const instance = new URLSearchParams(window.location.hash.slice(1)).get("instance");
if (window.opener && instance) {
  window.opener.postMessage({ type: "output-popout-ready", instance }, window.location.origin);
  window.addEventListener("pagehide", () => {
    window.opener?.postMessage({ type: "output-popout-closing", instance }, window.location.origin);
  }, { once: true });
} else {
  document.querySelector("#output-popout-status").textContent = "No active main client is attached. Open Pop Out from your secondary output window.";
}

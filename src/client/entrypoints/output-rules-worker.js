import { handleRuleRequest } from "../features/output-windows/rule-worker.js";

self.addEventListener("message", (event) => handleRuleRequest(event.data, (message) => self.postMessage(message)));

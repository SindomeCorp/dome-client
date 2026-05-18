import UAParser from "ua-parser-js";

export function parse(uaString = "") {
  const parser = new UAParser(uaString);
  const result = parser.getResult();
  return {
    toAgent() {
      const name = result.browser.name || "Other";
      const version = result.browser.version || "0.0.0";
      return name + " " + version;
    },
    os: {
      toString() {
        const name = result.os.name || "";
        const version = result.os.version || "";
        return [name, version].filter(Boolean).join(" ");
      }
    },
    device: {
      toString() {
        const vendor = result.device.vendor || "";
        const model = result.device.model || result.device.type || "";
        if (!vendor && !model) return "Other 0.0.0";
        return [vendor, model].filter(Boolean).join(" ");
      },
      type() {
        const uaLower = uaString.toLowerCase();
        if (/bot|crawler|spider/.test(uaLower)) return "bot";
        switch (result.device.type) {
        case "mobile":
          return "phone";
        case "tablet":
          return "tablet";
        case "smarttv":
          return "tv";
        default:
          return "desktop";
        }
      }
    }
  };
}

export function deviceCapture() {
  return (req, res, next) => {
    const ua = parse(req.headers["user-agent"]);
    req.device = ua.device.type();
    next();
  };
}

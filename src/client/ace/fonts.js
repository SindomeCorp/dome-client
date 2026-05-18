export const ACE_FONT_FAMILIES = {
  standard: "'Source Code Pro'",
  lucida: "'Lucida Console'",
  courier: "'Courier New'",
  roboto: "'Roboto Mono'",
  "comic-mono": "'Comic Mono'",
  monaco: "'Monaco'",
  menlo: "'Menlo'",
  "ubuntu-mono": "'Ubuntu Mono'",
  consolas: "'Consolas'",
};

export function getPreferredFont() {
  try {
    const raw = localStorage.getItem("dc-toggle-editorfont");
    if (raw != null) {
      return JSON.parse(raw);
    }
    const legacy = localStorage.getItem("dc-toggle-outfont");
    return legacy ? JSON.parse(legacy) : "standard";
  } catch {
    return "standard";
  }
}

export function getFontFamily(name = getPreferredFont()) {
  return ACE_FONT_FAMILIES[name] || ACE_FONT_FAMILIES.standard;
}

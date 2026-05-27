export function createReplacements(xterm256Colors, ESC) {
  const clampRgbComponent = function(component) {
    const parsed = Number.parseInt(component, 10);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return Math.max(0, Math.min(255, parsed));
  };

  return [
    // ansi color substitutions
    { type: "ansi", pattern: /\r\n/g,     replacement: "\n" },
    { type: "ansi", pattern: /\</g,       replacement: "&lt;" },
    { type: "ansi", pattern: /\>/g,       replacement: "&gt;" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[1\;30m`, "g"), replacement: "<span class=\"ansi-brblack\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[0\;30m`, "g"), replacement: "<span class=\"ansi-black\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[1\;31m`, "g"), replacement: "<span class=\"ansi-brred\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[0\;31m`, "g"), replacement: "<span class=\"ansi-red\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[1\;32m`, "g"), replacement: "<span class=\"ansi-brgreen\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[0\;32m`, "g"), replacement: "<span class=\"ansi-green\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[1\;33m`, "g"), replacement: "<span class=\"ansi-bryellow\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[0\;33m`, "g"), replacement: "<span class=\"ansi-yellow\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[1\;34m`, "g"), replacement: "<span class=\"ansi-brblue\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[0\;34m`, "g"), replacement: "<span class=\"ansi-blue\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[1\;35m`, "g"), replacement: "<span class=\"ansi-brmagenta\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[0\;35m`, "g"), replacement: "<span class=\"ansi-magenta\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[1\;36m`, "g"), replacement: "<span class=\"ansi-brcyan\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[0\;36m`, "g"), replacement: "<span class=\"ansi-cyan\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[1\;37m`, "g"), replacement: "<span class=\"ansi-bright\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[0\;37m`, "g"), replacement: "<span class=\"ansi-bright\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[4m`, "g"),     replacement: "<span class=\"ansi-underline\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[5m`, "g"),     replacement: "<span class=\"ansi-slow-blink\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[7m`, "g"),     replacement: "<span class=\"ansi-inverse\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[1m`, "g"),     replacement: "<span class=\"ansi-bold\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[2m`, "g"),     replacement: "<span class=\"ansi-faint\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[0m`, "g"),     replacement: "</span>" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[22m`, "g"),    replacement: "</span>" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[25m`, "g"),    replacement: "</span>" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[27m`, "g"),    replacement: "</span>" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[40m`, "g"),     replacement: "</span>" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[41m`, "g"),     replacement: "<span class=\"ansi-bgred\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[42m`, "g"),     replacement: "<span class=\"ansi-bggreen\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[43m`, "g"),     replacement: "<span class=\"ansi-bgyellow\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[44m`, "g"),     replacement: "<span class=\"ansi-bgblue\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[45m`, "g"),     replacement: "<span class=\"ansi-bgmagenta\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[46m`, "g"),     replacement: "<span class=\"ansi-bgcyan\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[47m`, "g"),     replacement: "<span class=\"ansi-bgwhite\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[49m`, "g"),     replacement: "</span>" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[00m`, "g"), replacement: "</span></span></span></span>" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[01m`, "g"), replacement: "<span class=\"ansi-underline\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[31m`, "g"), replacement: "<span class=\"ansi-red\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[32m`, "g"), replacement: "<span class=\"ansi-green\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[33m`, "g"), replacement: "<span class=\"ansi-yellow\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[34m`, "g"), replacement: "<span class=\"ansi-blue\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[35m`, "g"), replacement: "<span class=\"ansi-magenta\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[36m`, "g"), replacement: "<span class=\"ansi-cyan\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[37m`, "g"), replacement: "<span class=\"ansi-bright\">" },
    { type: "ansi", pattern: new RegExp(`${ESC}\\[38;2;(\\d+);(\\d+);(\\d+)m`, "g"), replacement: function(m, r, g, b) {
      const red = clampRgbComponent(r);
      const green = clampRgbComponent(g);
      const blue = clampRgbComponent(b);
      return `<span style="color: rgb(${red} ${green} ${blue})">`;
    }},
    { type: "ansi", pattern: new RegExp(`${ESC}\\[48;2;(\\d+);(\\d+);(\\d+)m`, "g"), replacement: function(m, r, g, b) {
      const red = clampRgbComponent(r);
      const green = clampRgbComponent(g);
      const blue = clampRgbComponent(b);
      return `<span style="background-color: rgb(${red} ${green} ${blue})">`;
    }},
    { type: "ansi", pattern: new RegExp(`${ESC}\\[38;5;(\\d+)m`, "g"), replacement: function( m, p1 ) {
      return "<span class=\"xterm256-" + xterm256Colors[ p1 ] + "\">";
    }},
    { type: "ansi", pattern: new RegExp(`${ESC}\\[48;5;(\\d+)m`, "g"), replacement: function( m, p1 ) {
      return "<span class=\"xterm256-bg-" + xterm256Colors[ p1 ] + "\">";
    }},
    { type: "ansi", pattern: new RegExp(`${ESC}\\[[0-9;]*m`, "g"), replacement: "" }

  ];
}

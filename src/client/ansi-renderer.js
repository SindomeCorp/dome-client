import { xterm256Colors } from "./xterm-colors.js";

const ESC = String.fromCharCode(27);
const CSI = `${ESC}[`;

function clampRgbComponent(component) {
  const parsed = Number.parseInt(component, 10);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(255, parsed));
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function colorFromAnsiCode(code, isBackground) {
  if (code >= 30 && code <= 37) {
    return { kind: "xterm256", index: code - 30, isBackground };
  }
  if (code >= 90 && code <= 97) {
    return { kind: "xterm256", index: code - 90 + 8, isBackground };
  }
  if (code >= 40 && code <= 47) {
    return { kind: "xterm256", index: code - 40, isBackground: true };
  }
  if (code >= 100 && code <= 107) {
    return { kind: "xterm256", index: code - 100 + 8, isBackground: true };
  }
  return null;
}

function styleToKey(style) {
  const classKey = style.classes.join("|");
  const inlineKey = style.inlineStyles.join("|");
  return `${classKey}::${inlineKey}`;
}

function getEffectiveColors(state) {
  let fg = state.fg;
  let bg = state.bg;
  if (state.effects.inverse) {
    const oldFg = fg;
    fg = bg;
    bg = oldFg;
  }
  return { fg, bg };
}

function getRenderedStyle(state) {
  const classes = [];
  const inlineStyles = [];
  const { fg, bg } = getEffectiveColors(state);

  if (fg) {
    if (fg.kind === "xterm256") {
      const colorName = xterm256Colors[fg.index];
      if (colorName) {
        classes.push(`xterm256-${colorName}`);
      }
    } else if (fg.kind === "truecolor") {
      inlineStyles.push(`color: rgb(${fg.r} ${fg.g} ${fg.b})`);
    }
  }

  if (bg) {
    if (bg.kind === "xterm256") {
      const colorName = xterm256Colors[bg.index];
      if (colorName) {
        classes.push(`xterm256-bg-${colorName}`);
      }
    } else if (bg.kind === "truecolor") {
      inlineStyles.push(`background-color: rgb(${bg.r} ${bg.g} ${bg.b})`);
    }
  }

  if (state.effects.bold) {
    classes.push("ansi-bold");
    inlineStyles.push("font-weight: bold");
  }
  if (state.effects.faint) {
    classes.push("ansi-faint");
  }
  if (state.effects.italic) {
    inlineStyles.push("font-style: italic");
  }
  if (state.effects.underline) {
    classes.push("ansi-underline");
  }
  if (state.effects.blink) {
    classes.push("ansi-slow-blink");
  }
  if (state.effects.inverse && !fg && !bg) {
    classes.push("ansi-inverse");
  }

  return { classes, inlineStyles };
}

function createDefaultState() {
  return {
    fg: null,
    bg: null,
    effects: {
      bold: false,
      faint: false,
      italic: false,
      underline: false,
      blink: false,
      inverse: false
    }
  };
}

export function createAnsiRenderer() {
  const state = createDefaultState();
  let carry = "";

  const applySgrCodes = (codes) => {
    const normalized = codes.length === 0 ? [0] : codes;

    for (let idx = 0; idx < normalized.length; idx++) {
      const code = normalized[idx];
      if (code === 0) {
        state.fg = null;
        state.bg = null;
        state.effects.bold = false;
        state.effects.faint = false;
        state.effects.italic = false;
        state.effects.underline = false;
        state.effects.blink = false;
        state.effects.inverse = false;
        continue;
      }

      if (code === 1) {
        state.effects.bold = true;
        continue;
      }
      if (code === 2) {
        state.effects.faint = true;
        continue;
      }
      if (code === 3) {
        state.effects.italic = true;
        continue;
      }
      if (code === 4) {
        state.effects.underline = true;
        continue;
      }
      if (code === 5) {
        state.effects.blink = true;
        continue;
      }
      if (code === 7) {
        state.effects.inverse = true;
        continue;
      }

      if (code === 22) {
        state.effects.bold = false;
        state.effects.faint = false;
        continue;
      }
      if (code === 23) {
        state.effects.italic = false;
        continue;
      }
      if (code === 24) {
        state.effects.underline = false;
        continue;
      }
      if (code === 25) {
        state.effects.blink = false;
        continue;
      }
      if (code === 27) {
        state.effects.inverse = false;
        continue;
      }
      if (code === 39) {
        state.fg = null;
        continue;
      }
      if (code === 49) {
        state.bg = null;
        continue;
      }

      if (code === 38 || code === 48) {
        const isBackground = code === 48;
        const mode = normalized[idx + 1];
        if (mode === 5) {
          const paletteIndex = normalized[idx + 2];
          if (Number.isInteger(paletteIndex) && paletteIndex >= 0 && paletteIndex <= 255) {
            const color = { kind: "xterm256", index: paletteIndex, isBackground };
            if (isBackground) {
              state.bg = color;
            } else {
              state.fg = color;
            }
          }
          idx += 2;
          continue;
        }
        if (mode === 2) {
          const red = clampRgbComponent(normalized[idx + 2]);
          const green = clampRgbComponent(normalized[idx + 3]);
          const blue = clampRgbComponent(normalized[idx + 4]);
          const color = { kind: "truecolor", r: red, g: green, b: blue, isBackground };
          if (isBackground) {
            state.bg = color;
          } else {
            state.fg = color;
          }
          idx += 4;
          continue;
        }
        continue;
      }

      const mappedColor = colorFromAnsiCode(code, false);
      if (mappedColor) {
        if (mappedColor.isBackground) {
          state.bg = mappedColor;
        } else {
          state.fg = mappedColor;
        }
      }
    }
  };

  const flushRun = (parts, style, run) => {
    if (!run) {
      return "";
    }
    const escaped = escapeHtml(run);
    if (style.classes.length === 0 && style.inlineStyles.length === 0) {
      parts.push(escaped);
      return "";
    }

    const classAttr = style.classes.length > 0
      ? ` class="${style.classes.join(" ")}"`
      : "";
    const styleAttr = style.inlineStyles.length > 0
      ? ` style="${style.inlineStyles.join("; ")}"`
      : "";
    parts.push(`<span${classAttr}${styleAttr}>${escaped}</span>`);
    return "";
  };

  return {
    renderChunk(input) {
      const source = carry + (input ?? "");
      carry = "";
      const parts = [];
      let currentStyle = getRenderedStyle(state);
      let currentKey = styleToKey(currentStyle);
      let run = "";
      let textStart = 0;
      let idx = 0;

      const flushTextTo = (end) => {
        if (end <= textStart) {
          return;
        }
        run += source.slice(textStart, end);
      };

      while (idx < source.length) {
        if (source[idx] === ESC) {
          if (idx + 1 >= source.length) {
            flushTextTo(idx);
            textStart = idx;
            carry = ESC;
            break;
          }
          if (source[idx + 1] !== "[") {
            idx += 1;
            continue;
          }
        }

        if (source.startsWith(CSI, idx)) {
          flushTextTo(idx);
          let term = idx + 2;
          while (term < source.length && !/[A-Za-z]/.test(source[term])) {
            term += 1;
          }
          if (term >= source.length) {
            carry = source.slice(idx);
            break;
          }

          const command = source[term];
          if (command === "m") {
            const rawParams = source.slice(idx + 2, term);
            const params = rawParams.length === 0
              ? []
              : rawParams.split(";").map((value) => {
                const parsed = Number.parseInt(value, 10);
                return Number.isNaN(parsed) ? null : parsed;
              }).filter((value) => value !== null);
            run = flushRun(parts, currentStyle, run);
            applySgrCodes(params);
            currentStyle = getRenderedStyle(state);
            currentKey = styleToKey(currentStyle);
          }

          idx = term + 1;
          textStart = idx;
          continue;
        }

        idx += 1;
      }

      flushTextTo(idx);
      run = flushRun(parts, currentStyle, run);
      void currentKey;
      return parts.join("");
    },
    resetState() {
      state.fg = null;
      state.bg = null;
      state.effects.bold = false;
      state.effects.faint = false;
      state.effects.italic = false;
      state.effects.underline = false;
      state.effects.blink = false;
      state.effects.inverse = false;
      carry = "";
    }
  };
}

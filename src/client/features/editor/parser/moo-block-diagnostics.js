const BLOCKS = {
  if: "endif",
  for: "endfor",
  while: "endwhile",
  try: "endtry",
  fork: "endfork"
};

const END_KEYWORDS = new Set(Object.values(BLOCKS));
const BRANCH_KEYWORDS = new Set(["elseif", "else", "except", "finally"]);

function isIdentifierStart(char) {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char) {
  return /[A-Za-z0-9_]/.test(char);
}

function readTokens(source) {
  const tokens = [];
  let row = 0;
  let column = 0;
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (char === "\n") {
      row += 1;
      column = 0;
      index += 1;
      continue;
    }
    if (/\s/.test(char)) {
      column += 1;
      index += 1;
      continue;
    }
    if (char === "\"") {
      index += 1;
      column += 1;
      while (index < source.length) {
        const stringChar = source[index];
        if (stringChar === "\n") {
          row += 1;
          column = 0;
          index += 1;
          continue;
        }
        index += 1;
        column += 1;
        if (stringChar === "\\") {
          if (index < source.length) {
            if (source[index] === "\n") {
              row += 1;
              column = 0;
            } else {
              column += 1;
            }
            index += 1;
          }
          continue;
        }
        if (stringChar === "\"") break;
      }
      continue;
    }
    if (!isIdentifierStart(char)) {
      column += 1;
      index += 1;
      continue;
    }

    const startIndex = index;
    const startColumn = column;
    while (index < source.length && isIdentifierPart(source[index])) {
      index += 1;
      column += 1;
    }
    const previousChar = startIndex > 0 ? source[startIndex - 1] : "";
    if (!["$", ".", ":"].includes(previousChar)) {
      tokens.push({
        text: source.slice(startIndex, index).toLowerCase(),
        row,
        column: startColumn
      });
    }
  }

  return tokens;
}

function unexpectedBlockAnnotation(token) {
  return {
    row: token.row,
    column: token.column,
    text: `Unexpected ${token.text}`,
    type: "error"
  };
}

function missingBlockAnnotation(block) {
  return {
    row: block.row,
    column: block.column,
    text: `Missing ${block.end}`,
    type: "error"
  };
}

export function collectMooBlockDiagnostics(source) {
  const stack = [];
  const annotations = [];

  for (const token of readTokens(String(source || ""))) {
    const expectedEnd = BLOCKS[token.text];
    if (expectedEnd) {
      stack.push({ ...token, end: expectedEnd });
      continue;
    }

    if (END_KEYWORDS.has(token.text)) {
      const openBlock = stack[stack.length - 1];
      if (!openBlock) {
        annotations.push(unexpectedBlockAnnotation(token));
        continue;
      }
      if (openBlock.end === token.text) {
        stack.pop();
        continue;
      }
      annotations.push(missingBlockAnnotation(openBlock));
      stack.pop();
      annotations.push(unexpectedBlockAnnotation(token));
      continue;
    }

    if (BRANCH_KEYWORDS.has(token.text) && stack.length === 0) {
      annotations.push(unexpectedBlockAnnotation(token));
    }
  }

  for (const block of stack.reverse()) {
    annotations.push(missingBlockAnnotation(block));
  }

  return annotations;
}

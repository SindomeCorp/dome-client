const types = {
  "object-id": /^#[0-9]+$/,
  "object-reference": /^(?:#[0-9]+|\$[A-Za-z_][A-Za-z0-9_]*)$/,
  "line-number": /^[1-9][0-9]{0,8}$/,
  "verb-name": /^[A-Za-z_][A-Za-z0-9_]*$/,
  "property-name": /^[A-Za-z_][A-Za-z0-9_]*$/,
  "channel-name": /^[^\]]+$/u
};
const controls = /[\p{Cc}\u2028\u2029]/u;
const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function check(condition, path, message) {
  if (!condition) throw new Error(path + ": " + message);
}

function fields(value, allowed, path) {
  check(value && typeof value === "object" && !Array.isArray(value), path, "expected an object");
  for (const key of Object.keys(value)) check(allowed.includes(key), path + "." + key, "unknown field");
}

function label(value, path) {
  check(typeof value === "string" && value.trim() && value.length <= 120 && !controls.test(value), path, "expected readable text (1–120 characters)");
}

export function parseCommandTemplate(template, captures) {
  check(typeof template === "string" && template.trim() && template.length <= 2048 && !controls.test(template), "template", "expected one nonempty command without control characters");
  const segments = [];
  let literal = "";
  for (let index = 0; index < template.length;) {
    if (template[index] !== "$") { literal += template[index++]; continue; }
    if (template[index + 1] === "$") { literal += "$"; index += 2; continue; }
    const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}/.exec(template.slice(index));
    check(match && Object.hasOwn(captures, match[1]), "template", "expected $$ or a declared ${capture}");
    if (literal) segments.push({ literal });
    literal = "";
    segments.push({ capture: match[1] });
    index += match[0].length;
  }
  if (literal) segments.push({ literal });
  return segments;
}

export function validCaptures(rule, values) {
  return Object.entries(rule.captures).every(([name, type]) => typeof values?.[name] === "string" && values[name].length <= 128 && !controls.test(values[name]) && types[type].test(values[name]) && (type !== "channel-name" || values[name].trim().length > 0));
}

function checkChannelArgument(segments, captures) {
  if (!segments.some((part) => part.capture && captures[part.capture] === "channel-name")) return;
  // Wildcard names can contain punctuation. They are lookup data for @rewind,
  // never expression fragments or arguments to an evaluation command.
  check(segments.length === 2 && segments[0].literal === "@rewind " && captures[segments[1].capture] === "channel-name", "template", "channel-name requires @rewind followed by one whole-argument capture");
}

export function interpolateCommand(action, rule, values) {
  check(validCaptures(rule, values), "captures", "missing or invalid typed capture");
  if (action.type === "game-command") checkChannelArgument(action.segments, rule.captures);
  const command = action.segments.map((part) => part.literal ?? values[part.capture]).join("");
  check(command.trim() && command.length <= 2048 && !controls.test(command), "command", "invalid single-line command");
  return command;
}

function actions(items, captures, selection, path) {
  check(Array.isArray(items) && items.length <= 24, path, "expected an array of at most 24 actions");
  const ids = new Set();
  return items.map((item, index) => {
    const location = path + "[" + index + "]";
    fields(item, ["id", "label", "type", "template", "action", "input"], location);
    check(typeof item.id === "string" && identifier.test(item.id) && !ids.has(item.id), location, "invalid or duplicate action ID");
    ids.add(item.id);
    label(item.label, location + ".label");
    if (item.type === "game-command") {
      check(!selection && item.action === undefined && item.input === undefined, location, "commands require token captures, never a selection");
      try {
        const segments = parseCommandTemplate(item.template, captures);
        checkChannelArgument(segments, captures);
        return { ...item, segments };
      }
      catch (error) { throw new Error(location + "." + error.message, { cause: error }); }
    }
    check(item.type === "client-action" && item.template === undefined, location, "expected a typed client action or game command");
    check(["clipboard.copy", "ide.open-scratch"].includes(item.action), location + ".action", "unknown client action ID");
    check(item.input === (selection ? "selection" : "target"), location + ".input", "input does not match context");
    check(item.action !== "ide.open-scratch" || selection, location, "Scratchpad requires selected text");
    return { ...item };
  });
}

// Read group declarations without mistaking escaped text or character classes for groups.
function groupNames(pattern) {
  const names = new Set();
  let inClass = false;
  for (let index = 0; index < pattern.length; index++) {
    if (pattern[index] === "\\") { index++; continue; }
    if (pattern[index] === "[") inClass = true;
    if (pattern[index] === "]") inClass = false;
    if (!inClass && pattern.slice(index, index + 3) === "(?<") {
      const match = /^\(\?<([A-Za-z_][A-Za-z0-9_]*)>/.exec(pattern.slice(index));
      if (match) names.add(match[1]);
    }
  }
  return names;
}

export function validateContextMenus(value) {
  fields(value, ["version", "rules", "profiles"], "config");
  check(value.version === 1, "version", "unsupported version");
  check(Array.isArray(value.rules) && value.rules.length <= 128, "rules", "expected at most 128 rules");
  const rules = new Map();
  value.rules.forEach((rule, index) => {
    const path = "rules[" + index + "]";
    fields(rule, ["id", "priority", "pattern", "flags", "captures", "actions", "heading", "target", "relatedContexts"], path);
    check(typeof rule.id === "string" && identifier.test(rule.id) && !rules.has(rule.id), path, "invalid or duplicate ID");
    check(Number.isInteger(rule.priority) && Math.abs(rule.priority) <= 10000, path + ".priority", "expected bounded integer");
    check(typeof rule.pattern === "string" && rule.pattern.length > 0 && rule.pattern.length <= 2048, path + ".pattern", "expected regex source (1–2048 characters)");
    check(rule.flags === undefined || ["", "i", "u", "iu", "ui"].includes(rule.flags), path + ".flags", "only i and u flags are supported");
    try { new RegExp(rule.pattern, rule.flags || "u"); }
    catch (error) { throw new Error(path + ".pattern: " + error.message, { cause: error }); }
    fields(rule.captures, Object.keys(rule.captures || {}), path + ".captures");
    const names = groupNames(rule.pattern);
    for (const [name, type] of Object.entries(rule.captures)) {
      check(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && Object.hasOwn(types, type) && names.has(name), path + ".captures." + name, "expected a declared named group with a supported type");
    }
    const checked = { ...rule, actions: actions(rule.actions, rule.captures, false, path + ".actions") };
    for (const field of ["heading", "target"]) if (rule[field] !== undefined) {
      try { checked[field + "Segments"] = parseCommandTemplate(rule[field], rule.captures); }
      catch (error) { throw new Error(path + "." + field + ": " + error.message, { cause: error }); }
    }
    check(rule.relatedContexts === undefined || (Array.isArray(rule.relatedContexts) && rule.relatedContexts.length <= 4), path + ".relatedContexts", "expected at most four related contexts");
    rules.set(rule.id, checked);
  });
  for (const rule of rules.values()) validateRelatedContexts(rule, rules);
  check(Array.isArray(value.profiles) && value.profiles.length <= 64, "profiles", "expected at most 64 profiles");
  const profiles = new Map();
  value.profiles.forEach((profile, index) => {
    const path = "profiles[" + index + "]";
    fields(profile, ["id", "label", "rules", "selectionActions"], path);
    check(typeof profile.id === "string" && identifier.test(profile.id) && !profiles.has(profile.id), path, "invalid or duplicate ID");
    label(profile.label, path + ".label");
    check(Array.isArray(profile.rules) && profile.rules.length <= 128 && new Set(profile.rules).size === profile.rules.length && profile.rules.every((id) => rules.has(id)), path + ".rules", "unknown or duplicate rule");
    for (const id of profile.rules) for (const related of rules.get(id).relatedContexts || []) {
      check(profile.rules.includes(related.rule), path + ".rules", "related contexts must use a rule in the same profile");
    }
    const selection = profile.selectionActions === undefined ? [] : profile.selectionActions;
    profiles.set(profile.id, { ...profile, selectionActions: actions(selection, {}, true, path + ".selectionActions") });
  });
  return { rules, profiles };
}

function validateRelatedContexts(rule, rules) {
  const seen = new Set();
  let count = rule.actions.length;
  for (const [index, related] of (rule.relatedContexts || []).entries()) {
    const path = rule.id + ".relatedContexts[" + index + "]";
    fields(related, ["rule", "captures"], path);
    const target = rules.get(related.rule);
    check(target && target !== rule && !seen.has(target.id), path + ".rule", "expected a unique known related rule");
    seen.add(target.id);
    check(!target.relatedContexts?.length, path + ".rule", "nested or recursive related contexts are not supported");
    check(target.headingSegments && target.targetSegments, path + ".rule", "related rule requires heading and target templates");
    fields(related.captures, Object.keys(target.captures), path + ".captures");
    for (const [name, type] of Object.entries(target.captures)) {
      const source = related.captures[name];
      const sourceType = typeof source === "string" ? rule.captures[source] : null;
      check(typeof source === "string" && Object.hasOwn(rule.captures, source) && (sourceType === type || (sourceType === "object-id" && type === "object-reference")), path + ".captures." + name, "expected a declared capture with a compatible type");
    }
    count += target.actions.length;
    check(count <= 24, path, "combined menu exceeds 24 actions");
  }
}

export function compileContextRules(rules) {
  return rules.map((rule) => ({ ...rule, regex: new RegExp(rule.pattern, (rule.flags || "u") + "g") }));
}

export function matchContextRules(text, rules) {
  check(typeof text === "string" && text.length <= 32768, "text", "line exceeds 32768 characters");
  const matches = [];
  for (const rule of rules) {
    const regex = rule.regex || new RegExp(rule.pattern, (rule.flags || "u") + "g");
    regex.lastIndex = 0;
    try {
      let match;
      while ((match = regex.exec(text)) !== null) {
        check(match[0].length > 0, rule.id, "zero-length matches are not supported");
        if (validCaptures(rule, match.groups || {})) matches.push({ rule: rule.id, start: match.index, end: match.index + match[0].length, values: { ...match.groups }, text: match[0] });
        check(matches.length <= 512, rule.id, "too many matches in one line");
      }
    } finally { regex.lastIndex = 0; }
  }
  return matches.sort((first, second) => rules.find((rule) => rule.id === second.rule).priority - rules.find((rule) => rule.id === first.rule).priority || (second.end - second.start) - (first.end - first.start));
}

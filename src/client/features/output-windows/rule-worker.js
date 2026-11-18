export function compileRules(rules) {
  return rules.map((rule) => ({
    id: rule.id,
    panel: rule.panel,
    regex: new RegExp(rule.pattern, rule.ignoreCase ? "i" : "")
  }));
}

export function matchRuleLines(compiled, lines, progress = () => {}) {
  const matches = new Array(lines.length).fill(false);
  for (const rule of compiled) {
    progress(rule.id);
    const target = rule.panel && rule.panel !== "secondary" ? rule.panel : true;
    for (let i = 0; i < lines.length; i++) {
      if (!matches[i] && rule.regex.test(lines[i])) matches[i] = target;
    }
  }
  return matches;
}

export function handleRuleRequest(message, post) {
  const { id, lines, rules, version } = message;
  try {
    // Versions are supplied by the client. Compile once for each configuration.
    if (handleRuleRequest.version !== version) {
      handleRuleRequest.compiled = compileRules(rules);
      handleRuleRequest.version = version;
    }
    const matches = matchRuleLines(handleRuleRequest.compiled, lines, (ruleId) => post({ id, activeRule: ruleId }));
    post({ id, matches });
  } catch (error) {
    post({ id, error: error.message });
  }
}

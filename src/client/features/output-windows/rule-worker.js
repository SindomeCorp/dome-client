export function compileRules(rules) {
  return rules.map((rule) => ({ id: rule.id, regex: new RegExp(rule.pattern, rule.ignoreCase ? "i" : "") }));
}

export function matchRuleLines(compiled, lines, progress = () => {}) {
  const matches = new Array(lines.length).fill(false);
  for (const rule of compiled) {
    progress(rule.id);
    for (let i = 0; i < lines.length; i++) {
      if (!matches[i]) matches[i] = rule.regex.test(lines[i]);
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

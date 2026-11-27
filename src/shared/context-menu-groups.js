import { interpolateCommand, validCaptures } from "./context-menu-validation.js";

// Text templates use the same small, pre-parsed grammar as commands, but are
// display/clipboard data only. Derivation never re-runs a regex at menu-open time.
function text(rule, field, values) {
  return interpolateCommand({ segments: rule[field + "Segments"] }, rule, values);
}

export function buildContextGroups(snapshot, profileId, match) {
  const profile = snapshot.profiles.get(profileId);
  const rule = snapshot.rules.get(match.rule);
  if (!profile?.rules.includes(match.rule) || !rule || !validCaptures(rule, match.values)) return [];
  const groups = [{ heading: rule.headingSegments ? text(rule, "heading", match.values) : match.text, match, text: match.text, actions: rule.actions }];
  for (const related of rule.relatedContexts || []) {
    const target = snapshot.rules.get(related.rule);
    const values = Object.fromEntries(Object.entries(related.captures).map(([name, source]) => [name, match.values[source]]));
    if (!profile.rules.includes(target.id) || !validCaptures(target, values)) continue;
    const reference = text(target, "target", values);
    groups.push({ heading: text(target, "heading", values), text: reference, match: { ...match, rule: target.id, values, text: reference }, actions: target.actions });
  }
  return groups;
}

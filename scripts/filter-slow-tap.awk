# scripts/filter-slow.awk
# used in npm run:find-slow to identify slow unit tests
# Robust TAP slow-test filter
# Prints: "ok <n> - <name> (<duration>ms)" when duration_ms >= THRESHOLD
# Usage: awk -v THRESHOLD=200 -f scripts/filter-slow-tap.awk

# Strip ANSI color codes that may wrap both ok line and duration lines
function strip_ansi(s) {
  gsub(/\x1B\[[0-9;]*[A-Za-z]/, "", s)
  return s
}

BEGIN {
  if (THRESHOLD == "") THRESHOLD = 200.0
  last_ok = ""
}

{
  line = strip_ansi($0)
}

# Save the most recent ok-line (test id + name)
line ~ /^ok[[:space:]]+[0-9]+[[:space:]]+-[[:space:]]/ {
  last_ok = line
  next
}

# On duration line, compare and maybe print
line ~ /^[[:space:]]*duration_ms:[[:space:]]*[0-9.eE+-]+/ {
  if (last_ok != "" && match(line, /duration_ms:[[:space:]]*([0-9.eE+-]+)/, m)) {
    dur = m[1] + 0
    if (dur >= THRESHOLD) {
      # Normalize to a sensible display (avoid huge float tails)
      printf "%s (%.6gms)\n", last_ok, dur
    }
  }
  next
}


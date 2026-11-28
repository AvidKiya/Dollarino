#!/usr/bin/env bash
# Runs a Cloudflare/Wrangler command for the deploy workflow.
#
# Why this exists:
#   1. Job logs on GitHub Actions live behind short-lived signed blob URLs which some
#      environments cannot read. Workflow *annotations* are always readable through the
#      REST API, so on failure the tail of the real output is re-published as an error
#      annotation. That is how the D1 free-tier read quota error was diagnosed.
#   2. D1's free tier rejects *every* query once the daily row-read limit is reached
#      (Cloudflare error code 7500, reset at midnight UTC). That is a transient,
#      external failure, so it is reported with its own annotation and exit code 78
#      ("configuration/quota blocked") instead of a generic crash.
#
# Usage: bash scripts/cf-step.sh "<step label>" <command> [...args]
set -uo pipefail

LABEL="${1:-Wrangler step}"
shift || true

if [ "$#" -eq 0 ]; then
  echo "::error title=${LABEL}::No command supplied to scripts/cf-step.sh"
  exit 2
fi

TMP_OUT="$(mktemp)"

# Annotations must be single-line, so collapse whitespace and escape workflow
# command delimiters (% -> %25, CR -> %0D, LF -> %0A). ANSI colours are stripped
# because Wrangler paints errors with escape codes.
collapse() {
  local text
  text="$(tr '\n' ' ' | tr -s ' ' | sed 's/\x1b\[[0-9;]*m//g')"
  text="${text//'%'/'%25'}"
  text="${text//$'\r'/'%0D'}"
  printf '%s' "$text"
}

# Picks the lines that actually explain a failure instead of the trailing stack frames.
# A 40-line tail of a Gradle crash is ~35 lines of `at org.gradle...` noise, which hid
# the real cause (e.g. "Could not resolve all dependencies" / "SDK location not found").
summarize_failure() {
  local file="$1"
  local picked
  picked="$(sed 's/\x1b\[[0-9;]*m//g' "$file" 2>/dev/null \
    | grep -vE '^[[:space:]]*(at |\.\.\. [0-9]+ more)' \
    | grep -E 'FAILURE|What went wrong|error:|Error:|ERROR|Exception|Caused by|not found|Could not|Failed|failed|> Task .*FAILED|RangeError|TypeError|Missing|Unsupported|denied' \
    | head -n 25)"
  if [ -z "$picked" ]; then
    picked="$(tail -n 25 "$file" 2>/dev/null)"
  fi
  printf '%s' "$picked"
}

set +e
"$@" 2>&1 | tee "$TMP_OUT"
STATUS="${PIPESTATUS[0]}"
set -e

HUMAN_TAIL="$(tail -n 40 "$TMP_OUT" 2>/dev/null | collapse)"
if [ "$STATUS" -ne 0 ]; then
  HUMAN_TAIL="$(summarize_failure "$TMP_OUT" | collapse)"
fi

# D1 free-tier quota exhaustion: every query is rejected until 00:00 UTC, so nothing
# downstream can succeed. Report it distinctly so the retry schedule makes sense.
if grep -qE "exceeded D1's free tier|code: 7500|daily row read limit" "$TMP_OUT" 2>/dev/null; then
  echo "::error title=D1 daily read quota exceeded::${LABEL} could not run because Cloudflare rejected the query with 7500 (free-tier daily row-read limit). Nothing was changed. The quota resets at 00:00 UTC and the scheduled deploy retries automatically every 2 hours. Details: ${HUMAN_TAIL:0:2500}"
  rm -f "$TMP_OUT"
  exit 78
fi

if [ "$STATUS" -eq 0 ]; then
  echo "::notice title=${LABEL} OK::${HUMAN_TAIL:0:900}"
else
  echo "::error title=${LABEL} failed (exit ${STATUS})::${HUMAN_TAIL:0:3500}"
fi

rm -f "$TMP_OUT"
exit "$STATUS"

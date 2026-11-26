#!/usr/bin/env bash
# Runs a Cloudflare/Wrangler command for the deploy workflow.
#
# Job logs on GitHub Actions live behind short-lived signed blob URLs which some
# environments (including the agent sandbox that maintains this repo) cannot read.
# Workflow *annotations* are always readable through the REST API, so on failure this
# script re-publishes the tail of the real output as an error annotation.
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
# command delimiters (% -> %25, CR -> %0D, LF -> %0A).
publish_tail() {
  local status="$1"
  local tail_text
  tail_text="$(tail -n 40 "$TMP_OUT" 2>/dev/null | tr '\n' ' ' | tr -s ' ')"
  tail_text="${tail_text//'%'/'%25'}"
  tail_text="${tail_text//$'\r'/'%0D'}"
  if [ "$status" -eq 0 ]; then
    echo "::notice title=${LABEL} OK::${tail_text:0:900}"
  else
    echo "::error title=${LABEL} failed (exit ${status})::${tail_text:0:3500}"
  fi
}

set +e
"$@" 2>&1 | tee "$TMP_OUT"
STATUS="${PIPESTATUS[0]}"
set -e

publish_tail "$STATUS"
rm -f "$TMP_OUT"
exit "$STATUS"

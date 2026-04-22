#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook for Edit/Write/MultiEdit.
# Blocks edits that introduce telemetry or analytics SDKs.
# LLM provider API endpoints are permitted — Fillix now supports external
# providers (see docs/prd-internet-access-multi-provider.md).

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")

case "$tool" in
  Write)
    content=$(jq -r '.tool_input.content // empty' <<<"$input")
    ;;
  Edit)
    content=$(jq -r '.tool_input.new_string // empty' <<<"$input")
    ;;
  MultiEdit)
    content=$(jq -r '[.tool_input.edits[]?.new_string] | join("\n")' <<<"$input")
    ;;
  *)
    exit 0
    ;;
esac

[ -z "$content" ] && exit 0

patterns=(
  'sentry\.io'
  '@sentry/'
  'posthog'
  'mixpanel'
  'amplitude'
  'datadoghq\.com'
  '@datadog/'
  'segment\.com'
  '@segment/'
  'analytics\.google\.com'
  'googletagmanager\.com'
)

hits=()
for pat in "${patterns[@]}"; do
  if grep -qE "$pat" <<<"$content"; then
    hits+=("$pat")
  fi
done

if [ ${#hits[@]} -gt 0 ]; then
  {
    echo "PRIVACY GUARD: this edit introduces a telemetry or analytics SDK."
    echo "Matched pattern(s): ${hits[*]}"
    echo
    echo "Fillix does not collect any telemetry or analytics (see CLAUDE.md)."
    echo "If the user genuinely asked for this change, have them confirm explicitly"
    echo "before retrying; otherwise remove the telemetry dependency."
  } >&2
  exit 2
fi

exit 0

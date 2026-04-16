#!/usr/bin/env bash
set -euo pipefail

# PreToolUse hook for Edit/Write/MultiEdit.
# Blocks edits that would break Fillix's local-only inference model
# (see CLAUDE.md): remote LLM endpoints and telemetry SDKs.

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
  'api\.openai\.com'
  'api\.anthropic\.com'
  'generativelanguage\.googleapis\.com'
  'api\.mistral\.ai'
  'api\.cohere\.ai'
  'api\.together\.xyz'
  'api\.perplexity\.ai'
  'api\.groq\.com'
  'api\.replicate\.com'
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
    echo "PRIVACY GUARD: this edit matches pattern(s) that would break Fillix's"
    echo "local-only inference model: ${hits[*]}"
    echo
    echo "Fillix only talks to the user's local Ollama at http://localhost:11434."
    echo "Remote LLM APIs and telemetry SDKs violate this invariant (see CLAUDE.md)."
    echo
    echo "If the user genuinely asked for this change, have them confirm explicitly"
    echo "before retrying; otherwise revise the edit to keep inference local."
  } >&2
  exit 2
fi

exit 0

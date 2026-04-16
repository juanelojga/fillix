#!/usr/bin/env bash
set -euo pipefail

# Stop hook: run pnpm typecheck before Claude ends a turn.
# Catches cross-file type errors that per-file lint cannot see.
# Emits JSON with decision:block so Claude sees the errors and fixes
# before stopping. Respects stop_hook_active to avoid infinite loops.

input=$(cat)
if [ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ]; then
  exit 0
fi

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

if output=$(pnpm typecheck 2>&1); then
  exit 0
fi

jq -n --arg reason "$output" '{
  decision: "block",
  reason: ("pnpm typecheck failed — fix the reported errors before ending the turn:\n\n" + $reason)
}'
exit 0

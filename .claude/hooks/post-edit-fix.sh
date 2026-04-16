#!/usr/bin/env bash
set -euo pipefail

# PostToolUse hook for Edit/Write/MultiEdit.
# Auto-formats with prettier and auto-fixes with eslint. Surfaces
# unfixable issues to Claude immediately instead of deferring to husky.

input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")

[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"

case "$file" in
  "$repo_root"/*) ;;
  /*) exit 0 ;;
  *) file="$repo_root/$file" ;;
esac

cd "$repo_root"

pnpm exec prettier --write --ignore-unknown --log-level=warn "$file" >&2 || true

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    if ! pnpm exec eslint --fix "$file" >&2; then
      echo >&2
      echo "eslint reported issues in $file that it could not auto-fix." >&2
      echo "Resolve the errors above before continuing." >&2
      exit 2
    fi
    ;;
esac

exit 0

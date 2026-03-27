#!/bin/bash
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" != *.md ]]; then
  exit 0
fi

if [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

REAL_PATH=$(realpath "$FILE_PATH")
CLAUDE_DIR=$(realpath "$CLAUDE_PROJECT_DIR/.claude")

case "$REAL_PATH" in
  "$CLAUDE_DIR"/*)
    cd "$CLAUDE_PROJECT_DIR" || exit 1
    npx --yes markdownlint-cli2 --fix "$FILE_PATH" 2>&1
    ;;
esac

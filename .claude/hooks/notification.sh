#!/bin/bash
set -euo pipefail

osascript -e 'display notification "Task completed" with title "Claude Code"' 2>/dev/null || true

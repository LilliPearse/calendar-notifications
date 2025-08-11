#!/bin/zsh
set -euo pipefail

# Repo root (absolute)
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/debug.log"

# Mark the trigger
echo "$(date) - run.sh triggered" >> "$LOG"

# Resolve Node binary across Homebrew / nvm / PATH
if command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
elif [ -x "$HOME/.nvm/versions/node/current/bin/node" ]; then
  NODE="$HOME/.nvm/versions/node/current/bin/node"
elif [ -x "$HOME/.nvm/versions/node/v22.17.0/bin/node" ]; then
  NODE="$HOME/.nvm/versions/node/v22.17.0/bin/node"
elif [ -x "/opt/homebrew/bin/node" ]; then
  NODE="/opt/homebrew/bin/node"
elif [ -x "/usr/local/bin/node" ]; then
  NODE="/usr/local/bin/node"
else
  echo "❌ Node not found in PATH or common locations." >> "$LOG"
  exit 1
fi

# Optional: work-hours filter — enable by exporting WORK_HOURS=1
if [ "${WORK_HOURS:-0}" = "1" ]; then
  day=$(date +%u)  # 1=Mon..7=Sun
  hour=$(date +%H) # 00..23
  if ! { [ "$day" -ge 1 ] && [ "$day" -le 5 ] && [ "$hour" -ge 9 ] && [ "$hour" -lt 18 ]; }; then
    echo "$(date) - outside work hours, skipping" >> "$LOG"
    exit 0
  fi
fi

# Knobs (can override via environment or LaunchAgent)
export LEAD_MINUTES="${LEAD_MINUTES:-2}"
export ALERT_DURATION_SEC="${ALERT_DURATION_SEC:-120}"
export CALENDAR_ID="${CALENDAR_ID:-primary}"

# Run the TypeScript (strict ESM)
"$NODE" --loader ts-node/esm "$DIR/src/calendar-notification.ts" >> "$LOG" 2>&1

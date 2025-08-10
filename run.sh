#!/bin/zsh

NODE_PATH="/Users/lillip/.nvm/versions/node/v22.17.0/bin/node"  # or your path from `which node`

# Get current day of week (1=Mon, 7=Sun) and hour (00–23)
day=$(date +%u)
hour=$(date +%H)

# Only run Mon–Fri (1–5) and 09:00–17:59
# if [ "$day" -ge 1 ] && [ "$day" -le 5 ] && [ "$hour" -ge 9 ] && [ "$hour" -lt 18 ]; then
"$NODE_PATH" --loader ts-node/esm src/calendar-notification.ts
# fi
